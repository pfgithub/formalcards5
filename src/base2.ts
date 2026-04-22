
/*

with (table, player ring, deck)

each (player) in (player ring):
    establish(hand) at (player) from []

take deck[..](facing table) -> shuffle -> establish (draw pile) at (table)
deal (player ring, draw pile, |player| player.hand, 7, facing.player)
take deck[top] -> flip(facing sky) -> establish (discard pile) at (table)

pick(first player) randomly from (player ring)
remember (turn) as (first player)
remember (eight suit) as (None)

loop:
    action = wait for: |player|
        if (turn) == (player):
            filterMap ((hand) of (player)): |card|
                if canPlay (card.viewAs(player), discard pile, eight suit):
                    [[
                        trigger = { move, from = card, to = discard pile }
                        action = {"play", card}
                    ]]
                else:
                    []
            + [[
                trigger = { move, from = deck[top], to = discard pile }
                action = {"draw"}
            ]]
        else:
            []
    match action {
        {"play", card} => {
            play (card)
        },
        {"draw"} => {
            (card) = take deck[top] -> flip (facing action.player)
            if deck.isEmpty():
                take discard[..top - 1] -> shuffle -> add to (deck)
            action = wait_for: |player|
                if (turn) != (player) return []
                [ if canPlay(card.view(player)) on (discard pile, eight suit) [
                    trigger = { move, from = card, to = discard pile }
                    action = "play"
                ], [
                    trigger = { move, from = card, to = hand of player }
                    action = "pass"
                ]]
            match action {
                "play" => {
                    play(card)
                }
                "pass" => {
                    card -> add to (hand of player)
                }
            }
        }
    }

define play (card):
    take card -> flip(facing sky) -> add to (draw pile) at (top)
    (eight suit) = (None)
    if (hand of action.player).isEmpty():
        throw new WinError(turn)
    if card.viewAs(player ring).number == "8":
        wait for: |player|
            if (turn) != (player) []
            (eight suit) = map (suit) of card suits:
                [[
                    trigger = { announce, suit }
                    action = suit
                ]]

define canPlay (card view) on (discard pile, eight suit):
    if (card view).number == "8":
        return true
    if let Some(suit) = (eight suit):
        return (card view).suit == (suit)
    let (top card) = discard_pile[top].view(player):
    return (card view).suit == (top card).suit or (card view).number == (top card).number
*/

let gid = 0;
class Object {
    id: number = gid++; // randomized on shuffle
    owner?: Object;
    contents: Object[] = [];
}

class Player extends Object {}

class Card extends Object {
    viewAs(perspective: Player): {
        suit: CardSuit,
        number: CardNumber,
    } {
        // if the player can't view the card, error
        throw new Error("TODO Card.view");
    }
}

export type CardSuit = "D" | "H" | "C" | "S";
const card_suits: CardSuit[] = ["D", "H", "C", "S"];
export type CardNumber = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
const card_numbers: CardNumber[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];