import { asc, Card, Effect, effect, error, Grid, jsAllUnique, never, Pile, Ring, Single, Unordered, unreachable, waitActionScreen, type CardNumber, type GameGenerator, type Player } from "./base";

// the state of the game
type State = {
    draw_pile: Pile<Card>,
    discard_pile: Pile<Card>,
    trash_pile: Unordered<Card>,

    circle: Ring<Player>,
    turn: Player,

    hands: Map<Player, Unordered<Card>>,
    faceups: Map<Player, Grid<Pile<Card>>>,
    facedowns: Map<Player, Grid<Single<Card>>>,
};
type Input = {
    deck: Pile<Card>,
    players: Ring<Player>,
};
type Output = {
    winner: Player,
};

const order: CardNumber[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function hand(state: State, player: Player): Unordered<Card> {
    return state.hands.get(player) ?? unreachable("every player already has a hand at this point");
}
function faceups(state: State, player: Player): Grid<Pile<Card>> {
    return state.faceups.get(player) ?? unreachable("every player already has faceups at this point");
}
function facedowns(state: State, player: Player): Grid<Single<Card>> {
    return state.facedowns.get(player) ?? unreachable("every player already has facedowns at this point");
}

export function* game(input: Input): GameGenerator<Output> {
    // form a circle of players (implicitly: in random order) and select a dealer (implicitly: random, as it is the 'first' player in the circle)
    const circle = new Ring();
    yield* circle.addClockwiseFrom(undefined, input.players.items());

    const draw_pile = new Pile<Card>();
    yield* draw_pile.addTop(input.deck.items());
    
    const state: State = {
        draw_pile, // implicitly: in random order
        discard_pile: new Pile(),
        trash_pile: new Unordered(),

        circle,
        turn: circle.random() ?? unreachable("need at least two players"),

        hands: new Map(),
        faceups: new Map(),
        facedowns: new Map(),
    };
    
    // dealer shuffles the draw pile
    yield* state.draw_pile.shuffle();

    // dealer deals facedowns to each player
    for (const player of state.circle.items()) {
        state.facedowns.set(player, new Grid(3, 1));
        const piles: Single<Card>[] = [];
        for (let i = 0; i < 3; i += 1) {
            const card = state.draw_pile.top() ?? error("not enough cards / too many players");
            const pile = new Single<Card>();
            yield* pile.add([card]);
            piles.push(pile);
        }
        facedowns(state, player).add(piles);
    }

    // each player has a hand
    for (const player of state.circle.items()) state.hands.set(player, new Unordered());

    // dealer deals six cards to each player
    for (let i = 0; i < 2; i += 1) {
        for (const player of state.circle.items()) {
            yield* hand(state, player).add(state.draw_pile.topN(3));
        }
    }

    // start with left of the dealer
    state.turn = state.circle.clockwiseNext(state.turn);
    
    // each player selects three piles of cards to be their faceups. order here will be defined as clockwise.
    for (const sel_player of state.circle.clockwiseStartingWith(state.turn)) {
        yield* waitActionScreen(asc.record({
            // alternatively, we could allow anyone to announce in any order. but that would make
            // the game simultaneous (not quite! even worse) which theoretically could affect optimal play.
            actor: asc.actor([state.turn]),
            piles: asc.list(asc.list(asc.enum(hand(state, state.turn).items()), {min: 1}), {exact: 3}),
        }), function* (action) {
            if (!jsAllUnique(action.piles.flat(2))) return "fail"; // no duplicate cards allowed
            
            // place the three piles face up in front of you
            state.faceups.set(sel_player, new Grid(3, 1));
            const piles: Pile<Card>[] = [];
            for (const cont of action.piles) {
                const pile = new Pile<Card>();
                yield* pile.add(cont);
                piles.push(pile);
            }
            faceups(state, sel_player).add(piles);
        });
    }

    // begin play
    try {while (true) {
        // first player's turn
        turn(state);
        
        // play advances left
        state.turn = state.circle.clockwiseNext(state.turn);
    }} catch(e) {
        if (e instanceof WinEffect) {
            return {
                winner: e.winner,
            };
        } else throw e;
    }
}

function* turn(state: State): GameGenerator<void> {
    yield* waitActionScreen(asc.choose({
        play_cards: asc.record({actor: asc.actor([state.turn]), cards: asc.list(asc.enum(hand(state, state.turn).items()))}),
        play_faceup: asc.record({actor: asc.actor([state.turn]), pile: asc.enum(faceups(state, state.turn).items().filter(t => !t.empty()))}),
        play_facedown: asc.record({actor: asc.actor([state.turn]), pile: asc.enum(facedowns(state, state.turn).items().filter(t => !t.empty()))}),
        pick_up_pile: asc.record({}),
    }), function* (action): GameGenerator<"fail" | undefined> {
        if (action.key === "play_cards") {
            if (!checkGroupMultiple(state, action.value.cards)) return "fail";
            if (!canPlay(state, action.value.cards[0] ?? unreachable("just checked"))) return "fail";
            yield* playCards(state, action.value.cards);
        } else if (action.key === "play_faceup") {
            if (!hand(state, state.turn).empty()) return "fail";
            if (!checkGroupMultiple(state, action.value.pile.items())) return "fail";
            if (!canPlay(state, action.value.pile.items()[0] ?? unreachable("just checked"))) return "fail";
            yield* playCards(state, action.value.pile.items());
        } else if (action.key === "play_facedown") {
            if (!hand(state, state.turn).empty()) return "fail";
            if (!faceups(state, state.turn).items().every(it => it.empty())) return "fail";
            if (!canPlay(state, action.value.pile.items()[0] ?? unreachable("just checked"))) {
                yield* pickUpPile(state);
            } else {
                yield* playCards(state, action.value.pile.items());
            }
        } else if (action.key === "pick_up_pile") {
            yield* pickUpPile(state);
        } else never(action);
    });
}

function discardValue(state: State, card: Card | undefined): number | undefined {
    if (!card) return undefined;
    if (card.number === "2") return undefined;
    if (card.number === "3") return discardValue(state, state.draw_pile.below(card));
    return order.indexOf(card.number);
}
function canPlay(state: State, card: Card): boolean {
    if (card.number === "2" || card.number === "3" || card.number === "10") return true;
    const discard_value = discardValue(state, state.discard_pile.top());
    return order.indexOf(card.number) >= (discard_value ?? 0);
}

function* playCards(state: State, cards: Card[]): GameGenerator<void> {
    const last = cards[cards.length - 1] ?? unreachable("unvalidated pile");
    state.discard_pile.addTop(cards);
    yield* checkWin(state);
    if (last.number === "10") {
        yield* trashDiscard(state);
    } else {
        const four_last = state.draw_pile.topN(4);
        if (checkGroupMultiple(state, four_last)) {
            yield* trashDiscard(state);
        }
    }
}

function* checkWin(state: State): GameGenerator<void> {
    if (hand(state, state.turn).empty()
        && faceups(state, state.turn).items().every(it => it.empty())
        && facedowns(state, state.turn).items().every(it => it.empty())
    ) yield* effect(new WinEffect(state.turn));
}

function* pickUpPile(state: State): GameGenerator<void> {
    yield* hand(state, state.turn).add(state.discard_pile.items());
    yield* turn(state); // you get to go again
}

function* trashDiscard(state: State): GameGenerator<void> {
    yield* state.trash_pile.add(state.discard_pile.items());
    yield* turn(state); // you go again
}

function checkGroupMultiple(state: State, cards: Card[]): boolean {
    return cards.length >= 1 && // at least one card
        cards.every((c, i, a) => c.number === a[0]!.number) && // all same number
        jsAllUnique(cards); // all unique
}

class WinEffect extends Effect<never> {
    constructor(public winner: Player) {super()}
}
