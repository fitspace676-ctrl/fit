// Post-processing for model-written Georgian copy.
//
// The system prompts ask for plain Mkhedruli without long dashes, but models
// still slip: an em dash in a sentence, or a word in Mtavruli capitals (which
// most fonts on members' phones render poorly). Text that ends up in a gym's
// own messages is cleaned here instead of trusting the prompt.

const MTAVRULI_FIRST = 0x1c90;
const MKHEDRULI_FIRST = 0x10d0;

/**
 * Replace em/en dashes (U+2014, U+2013) with a plain hyphen and fold Mtavruli
 * capitals (U+1C90..U+1CBA, U+1CBD..U+1CBF) onto their Mkhedruli letters.
 * Everything else, Latin text included, is returned unchanged.
 */
export function sanitizeGeorgianText(text: string): string {
  return text
    .replace(/[–—]/g, '-')
    .replace(/[Ა-ᲺᲽ-Ჿ]/g, (letter) =>
      String.fromCharCode(letter.charCodeAt(0) - MTAVRULI_FIRST + MKHEDRULI_FIRST),
    );
}
