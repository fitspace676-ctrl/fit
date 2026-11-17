import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { MediaCleanupService } from '../storage/media-cleanup.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MePhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
    private readonly cleanup: MediaCleanupService,
    private readonly redis: RedisService,
  ) {}

  private async member() {
    if (!this.tenant.userId) throw new ForbiddenException('A signed-in session is required');
    const member = await this.prisma.client.gymMember.findFirst({
      where: { gymId: this.tenant.gymId, userId: this.tenant.userId, deletedAt: null },
      select: { id: true, photoUrl: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private grantKey(memberId: string, url: string) {
    const digest = createHash('sha256').update(url).digest('hex');
    return `member-photo:${this.tenant.gymId}:${memberId}:${digest}`;
  }

  async createUpload(input: { contentType: string; contentLength: number }) {
    const member = await this.member();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.contentType)) {
      throw new BadRequestException('Only JPEG, PNG and WebP photos are supported');
    }
    if (!this.storage.publicUrl('')) {
      throw new ServiceUnavailableException('Public image storage is not configured');
    }
    // No client filename/entity: the MIME type determines the extension.
    const upload = await this.storage.createSignedUpload({
      ...input,
      gymId: this.tenant.gymId,
      entity: 'memberphotos',
    });
    if (!upload.publicUrl)
      throw new ServiceUnavailableException('Public image storage is not configured');
    // A URL alone is not ownership proof. Only a URL minted for THIS member can
    // be attached, once, within the upload window (across API replicas as well).
    await this.redis.client.set(
      this.grantKey(member.id, upload.publicUrl),
      '1',
      'EX',
      upload.expiresIn,
    );
    return upload;
  }

  async setPhoto(photoUrl: string | null) {
    const member = await this.member();
    if (photoUrl !== null) {
      const grant = await this.redis.client.getdel(this.grantKey(member.id, photoUrl));
      if (grant !== '1') throw new BadRequestException('Photo must be uploaded by this member');
    }
    // Compare-and-set prevents an overlapping edit from deleting the winning
    // photo. A consumed grant cannot later reattach an object cleanup removed.
    const updated = await this.prisma.client.gymMember.updateMany({
      where: {
        id: member.id,
        userId: this.tenant.userId!,
        gymId: this.tenant.gymId,
        deletedAt: null,
        photoUrl: member.photoUrl,
      },
      data: { photoUrl },
    });
    if (updated.count !== 1) throw new ConflictException('Profile changed; please upload again');
    await this.cleanup.discardUnreferenced(this.tenant.gymId, [member.photoUrl], [photoUrl]);
    return { photoUrl };
  }
}
