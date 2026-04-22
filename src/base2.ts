import { jsShuffle } from "./base";


const hand = defineEstablishment<Pile<Card>>("hand");
const draw_pile = defineEstablishment<Pile<Card>>("draw pile");
const discard_pile = defineEstablishment<Pile<Card>>("discard pile");
function main(table: Group, player_ring: Ring<Player>, deck: Pile<Card>) {
    const dealer = defineRemember<Player>("dealer", player_ring.random());

    for (const player of player_ring.clockwise(dealer.value)) {
        new Hand<Card>(player).establish(player, hand);
    }

    deck.takeSub().shuffle().establish(table, draw_pile);
    for (let i = 0; i < 7; i += 1) {
        for (const player of player_ring.clockwise(dealer.value)) {
            player.get(hand).add(table.get(draw_pile).takeSub(-1).items);
        }
    }
    table.get(draw_pile).takeSub(-1).flip().establish(table, discard_pile);

    const turn = defineRemember<Player>("turn", player_ring.clockwise(dealer.value)[1]!);
    const eight_suit = defineRemember<CardSuit | undefined>("eight suit", undefined);

    while (true) {
        type ActionRes = {kind: "play", card: Card} | {kind: "draw"};
        const action: ActionRes = waitFor((player): WaitItem<ActionRes>[] => {
            if (player !== turn.value) return [];
            return [
                ...player.get(hand).items.filter(card => canPlay(card.viewAs(player), table.get(discard_pile), eight_suit.value)).map((card): WaitItem<ActionRes> => {
                    return {
                        trigger: {kind: "move", obj: card, to: table.get(discard_pile)},
                        action: {kind: "play", card},
                    };
                }),
                {
                    trigger: {kind: "move", obj: table.get(draw_pile).peekSub(-1)[0]!, to: player.get(hand)},
                    action: {kind: "draw"},
                },
            ];
        });
        if (action.kind === "play") {
            playCard(table, turn.value, action.card, turn.value.get(hand), table.get(discard_pile), eight_suit);
        } else if (action.kind === "draw") {
            type ActionRes2 = "play" | "pass";
            const drawn = table.get(draw_pile).takeSub(-1).face(turn.value).items[0]!;
            if (table.get(draw_pile).empty()) {
                table.get(draw_pile).add(table.get(discard_pile).takeSub(0, -1).flip().shuffle().items);
            }
            const action: ActionRes2 = waitFor((player): WaitItem<ActionRes2>[] => {
                if (player !== turn.value) return [];
                return [
                    ...canPlay(drawn.viewAs(turn.value), table.get(discard_pile), eight_suit.value) ? [{
                        trigger: {kind: "move", obj: drawn, to: table.get(discard_pile)},
                        action: "play",
                    } satisfies WaitItem<ActionRes2> as WaitItem<ActionRes2>] : [],
                    {
                        trigger: {kind: "move", obj: drawn, to: player.get(hand)},
                        action: "pass",
                    },
                ];
            });
            if (action === "play") {
                playCard(table, turn.value, drawn, turn.value.get(hand), table.get(discard_pile), eight_suit);
            } else if (action === "pass") {
                turn.value.get(hand).add([drawn]);
            }
        }
    }
}

function canPlay(card: CardView, discard_pile: Pile<Card>, eight_suit: CardSuit | undefined): boolean {
    if (card.number === "8") return true;
    if (eight_suit != null) return card.suit === eight_suit;
    const top = discard_pile.peekSub(-1)[0]!.viewAs("*");
    return card.number === top.number || card.suit === top.suit;
}
function playCard(table: Object, turn: Player, card: Card, hand: Pile<Card>, discard_pile: Pile<Card>, eight_suit: Remember<CardSuit | undefined>) {
    discard_pile.add([card.take().flip()]);
    if (hand.empty()) {
        throw new WinError(turn);
    }
    eight_suit.value = undefined;
    if (card.viewAs("*").number === "8") { // alt: card.performEffect(state)
        eight_suit.value = waitFor((player): WaitItem<CardSuit>[] => {
            if (player !== turn) return [];
            return card_suits.map((suit): WaitItem<CardSuit> => ({
                trigger: {kind: "announce", msg: suit},
                action: suit,
            }));
        });
    }
}
class WinError extends Error {constructor(public player: Player) {super("win")}}

type Establishment<T extends Object> = {name: string, est_sym: symbol, _t: T};
function defineEstablishment<T extends Object>(name: string): Establishment<NoInfer<T>> {
    return {name, est_sym: Symbol(), _t: 0 as any};
}

type Remember<T> = {name: string, rem_sym: symbol, value: T};
function defineRemember<T>(name: string, value: NoInfer<T>): Remember<NoInfer<T>> {
    return {name, rem_sym: Symbol(), value};
}

type WaitTrigger = {
    kind: "move",
    obj: Object,
    to: Object,
} | {
    kind: "announce",
    msg: string,
};
type WaitItem<T> = {
    trigger: WaitTrigger,
    action: T,
};
function waitFor<T>(cb: (player: Player) => WaitItem<T>[]): NoInfer<T> {
    throw new Error("TODO wait");
}

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
    contents: Set<Object> = new Set();
    protected own(item: Object): void {
        item.owner?.disown(item);
        this.contents.add(item);
        item.owner = this;
    }
    disown(item: Object): void {
        this.contents.delete(item);
        item.owner = undefined;
    }

    establish<T extends Object>(this: NoInfer<T>, group: Group, name: Establishment<T>) {
        group.add(name, this);
        return this;
    }
    flip() {return this}
}
class Group extends Object {
    named: Map<Object, Establishment<Object>> = new Map();
    reverse: Map<symbol, Object> = new Map();
    add<T extends Object>(name: Establishment<T>, item: NoInfer<T>) {
        this.own(item);
        this.named.set(item, name);
        this.reverse.set(name.est_sym, item);
    }
    get<T extends Object>(name: Establishment<T>): NoInfer<T> {
        return this.reverse.get(name.est_sym) as T;
    }
    override disown(item: Object): void {
        super.disown(item);
        this.reverse.delete(this.named.get(item)!.est_sym);
        this.named.delete(item);
    }
}
class Ring<T extends Object> extends Object {
    items: T[] = [];
    random(): T {
        return this.items[Math.random() * this.items.length |0]!;
    }
    clockwise(from: T): T[] {
        const i = this.items.indexOf(from);
        return [...this.items.slice(i), ...this.items.slice(0, i)];
    }
}
type FacingTarget = Player | "table";
class Pile<T extends Object> extends Object {
    items: T[] = [];
    facing_target: FacingTarget;

    constructor(facing_target: FacingTarget) {
        super();
        this.facing_target = facing_target;
    }

    shuffle() {
        jsShuffle(this.items);
        const ids = this.items.map(it => it.id);
        jsShuffle(ids);
        for (let i = 0; i < ids.length; i++) this.items[i]!.id = i;
        return this; // eew
    }
    override flip() {
        this.items.reverse();
        for (const item of this.items) item.flip();
        return super.flip();
    }
    peekSub(start: number = 0, end: number = this.items.length): T[] {
        return this.items.slice(start, end);
    }
    takeSub(start: number = 0, end: number = this.items.length): Pile<T> {
        const res = new Pile<T>(this.facing_target);
        res.add(this.peekSub(start, end));
        return res;
    }
    face(facing_target: FacingTarget) {
        this.facing_target = facing_target;
        return this;
    }
    add(items: T[]) {
        for (const it of items) {
            this.own(it);
            this.items.push(it);
        }
    }
    empty(): boolean {
        return this.items.length === 0;
    }
    override disown(item: Object): void {
        super.disown(item);
        this.items.splice(this.items.indexOf(item as T), 1);
    }
}

class Hand<T extends Object> extends Pile<T> {

}

class Player extends Group {}

class Card extends Object {
    visible_to_all: boolean = true;

    override flip() {
        this.visible_to_all = !this.visible_to_all;
        return super.flip();
    }

    take(): Card {
        this.owner?.disown(this);
        return this;
    }

    viewAs(perspective: Player | "*"): CardView {
        if (!this.owner) throw new Error("card has no owner, todo");
        if (!(this.owner instanceof Pile)) throw new Error("!owner pile todo");
        if (this.owner.facing_target === perspective) {
            // facing you
            if (this.visible_to_all) throw new Error("you can't see this card, it's facing away from you");
            throw new Error("TODO: get card data from view map");
        } else {
            // facing table
            if (this.visible_to_all) throw new Error("TODO: get card data from view map");
            throw new Error("you can't see this card");
        }
    }
}
type CardView = {
    suit: CardSuit,
    number: CardNumber,
};

export type CardSuit = "D" | "H" | "C" | "S";
const card_suits: CardSuit[] = ["D", "H", "C", "S"];
export type CardNumber = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
const card_numbers: CardNumber[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];