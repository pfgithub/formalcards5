import type { Card, CardNumber, CardSuit, Pile, Player, Ring, Unordered } from "./base";

type State = {
    pile: Pile<Card>,

    circle: Ring<Player>,
    turn: Player,

    hands: Map<Player, Unordered<Card>>,
    melds: Map<Player, Unordered<Card>>,

    bid: number,
    leader?: Player,
    trump?: CardSuit,

    scores: {
        us: {total: number, meld?: number, play?: number},
        them: {total: number, meld?: number, play?: number},
    },
};

/*
outline:
- bidding
  - bid (# >= prev_bid + 1) (opening at 21 = 1 leg. opening at 22, or +2 from the previous bid = 2 legs. 23 / +3  = 3 legs. 24/+4=4)
  - pass
- winner (last remaining) chooses trump suit
- winning team: both players select 3 cards to pass, or leader invokes double run exemption
  - pass_cards [3]card (we will allow either order. for optimal play assuming players aren't using hidden information channels this should have no effect)
  - exemption
- trade cards
- reveal melds (we'll require it in turn order from the leader because it could technically affect choices of subsequent players in optimal play)
- score melds
- retrieve melds
- play of the hand
  - in turn order, play a card
  - resolve trick
  - continue
- score play
- add total, reset meld/play scores
- repeat until done a total of 4 times
*/

const order: CardNumber[] = ["9", "J", "Q", "K", "10", "A"];