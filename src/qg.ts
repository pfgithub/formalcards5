import { effect, Effect, error, never, OrderedPile, OrderedRing, Single, Unordered, unreachable, waitAction, type Card, type CardSuit, type CardValue, type GameGenerator, type Player, type UnorderedSpread } from "./base";

// the state of the game
type State = {
    draw_pile: OrderedPile<Card>,
    discard_pile: OrderedPile<Card>,
    trash_pile: Unordered<Card>,

    circle: OrderedRing<Player>,
    turn: Player,

    hands: Map<Player, UnorderedSpread<Card>>,
    faceups: Map<Player, Unordered<Card>[]>,
    facedowns: Map<Player, Single<Card>[]>,
};
type Input = {
    deck: Unordered<Card>,
    players: Unordered<Player>,
};
type Output = {
    winner: Player,
};

const order: CardValue[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function hand(state: State, player: Player): UnorderedSpread<Card> {
    return state.hands.get(player) ?? unreachable("every player already has a hand at this point");
}
function faceups(state: State, player: Player): Unordered<Card>[] {
    return state.faceups.get(player) ?? unreachable("every player already has faceups at this point");
}
function facedowns(state: State, player: Player): Single<Card>[] {
    return state.facedowns.get(player) ?? unreachable("every player already has facedowns at this point");
}

export function* game(input: Input): GameGenerator<Output> {
    // form a circle of players (implicitly: in random order) and select a dealer (implicitly: random, as it is the 'first' player in the circle)
    const circle = new OrderedRing();
    yield* circle.initializeClockwise(input.players.items());

    const draw_pile = new OrderedPile<Card>();
    for (const item of input.deck.items()) yield* draw_pile.addTop(item);
    
    const state: State = {
        draw_pile, // implicitly: in random order
        discard_pile: new OrderedPile(),
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
        state.facedowns.set(player, []);
        for (let i = 0; i < 3; i += 1) {
            const card = state.draw_pile.top() ?? error("not enough cards / too many players");
            const pile = new Single<Card>();
            yield* pile.set(card);
            facedowns(state, player).push(pile);
        }
    }

    // each player has a hand
    for (const player of state.circle.items()) state.hands.set(player, new Unordered());

    // dealer deals six cards to each player
    for (let i = 0; i < 6; i += 1) {
        for (const player of state.circle.items()) {
            const card = state.draw_pile.top() ?? error("not enough cards / too many players");
            yield* hand(state, player).add(card);
        }
    }

    // start with left of the dealer
    state.turn = state.circle.clockwiseNext(state.turn);
    
    // each player selects three piles of cards to be their faceups. order here will be defined as clockwise.
    for (const sel_player of state.circle.clockwiseStartingWith(state.turn)) {
        const action = yield* waitAction({
            select_piles: (player: Player, data: {piles: Card[][]}) => (
                player === sel_player &&
                data.piles.length === 3 && // three piles
                data.piles.every(p => (
                    p.length >= 1 && // at least one card per pile
                    p.every(c => hand(state, player).has(c)) && // all the cards came from your hand
                    p.every((c, i, a) => c.number === a[0]!.number) // multiple cards in one pile? all are the same
                )) &&
                data.piles.flat(2).length === new Set(data.piles.flat(2)).size // no duplicate cards selected
            ),
        });

        // TODO: continue impl
    }
}