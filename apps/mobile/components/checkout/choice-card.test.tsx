// The join funnel's one-of-many card, and the one thing about it that is not
// obvious from the props: `photoUrl` is three-valued.
//
// A branch is a place, so its card leads with a picture of it — web's
// `locationCard` has done this since the branch picker stopped being a row of
// name-only chips. A plan is not a place and has no picture. So `undefined`
// means "no band at all" and `null` means "a band, showing the monogram": a
// branch whose photo has not been uploaded yet must not be a hole in a list of
// pictures.

import { fireEvent } from '@testing-library/react-native';

import { ChoiceCard } from './choice-card';
import { renderScreen } from '../../test-support/render-screen';

const BASE = {
  title: 'Rustaveli Flagship',
  selected: false,
  onPress: jest.fn(),
  accessibilityLabel: 'Rustaveli Flagship. 12 Rustaveli Ave',
  testID: 'c',
} as const;

describe('the photo band', () => {
  it('draws the photograph when the branch has one', () => {
    const view = renderScreen(
      <ChoiceCard {...BASE} photoUrl="https://images.example.com/rustaveli.jpg" />,
    );

    expect(view.getByTestId('c-photo-image').props.source).toEqual({
      uri: 'https://images.example.com/rustaveli.jpg',
    });
    expect(view.queryByTestId('c-photo-initial')).toBeNull();
  });

  it('draws the branch’s initial when it has none, not an empty hole', () => {
    const view = renderScreen(<ChoiceCard {...BASE} photoUrl={null} />);

    expect(view.getByTestId('c-photo')).toBeTruthy();
    expect(view.getByTestId('c-photo-initial')).toHaveTextContent('R');
    expect(view.queryByTestId('c-photo-image')).toBeNull();
  });

  // A dead R2 URL would otherwise leave the band empty on every card that has
  // one, which reads as a page still loading rather than as a missing photo.
  it('falls back to the initial when the image fails to load', () => {
    const view = renderScreen(
      <ChoiceCard {...BASE} photoUrl="https://images.example.com/gone.jpg" />,
    );

    fireEvent(view.getByTestId('c-photo-image'), 'error');
    expect(view.getByTestId('c-photo-initial')).toHaveTextContent('R');
    expect(view.queryByTestId('c-photo-image')).toBeNull();
  });

  it('draws no band at all for a plan, which is not a place', () => {
    const view = renderScreen(<ChoiceCard {...BASE} title="Premium" price="120 ₾" />);

    expect(view.queryByTestId('c-photo')).toBeNull();
  });

  // Uppercasing is where this parts company with web: Unicode 11 maps Mkhedruli
  // to MTAVRULI, a display alphabet, so `'ვ'.toUpperCase()` changes the script
  // the reader is reading rather than emphasising the letter.
  it('does not uppercase a Georgian branch name’s initial', () => {
    const view = renderScreen(<ChoiceCard {...BASE} title="ვაკის ფილიალი" photoUrl={null} />);

    expect(view.getByTestId('c-photo-initial')).toHaveTextContent('ვ');
  });
});
