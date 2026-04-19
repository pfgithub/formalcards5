
export class Owned {
    _owner: Area<Owned> | undefined = undefined;
    constructor() {}
}
export class Area<T extends Owned> extends Owned {
    #contents: T[] = [];
    #hooks: (() => GameGenerator<void>)[] = [];
    constructor() {
        super();
    }
    items(): T[] {return this.#contents}

    _own(item: T) {
        if (item._owner) item._owner.remove(item);
        item._owner = this;
    }
    * remove(item: T): GameGenerator<void> {
        const idx = this.#contents.indexOf(item);
        if (idx === -1) unreachable("can't remove; not in");
        this.#contents.splice(idx, 1);
        yield* this._updated();
    }
    * _updated(): GameGenerator<void> {
        for (const hook of this.#hooks) yield* hook();
    }
    
    random(): T | undefined {
        return this.items()[Math.random() * this.items().length |0];
    }
    has(item: T): boolean {return this.#contents.includes(item)}

    empty(): boolean {return this.#contents.length === 0}

    onUpdate(cb: (a: Area<T>) => GameGenerator<void>): void {
        // this really wants algebraic effects but GameGenerator<void> should suffice
        // we can basically fully simulate algebraic effects using GameGenerator<void> and some global variables if we want
        // actually yeah that's a good idea imo
        this.#hooks.push(() => cb(this));
    }
}
export class Unordered<T extends Owned> extends Area<T> {
    constructor() {super()}
    * add(item: T): GameGenerator<void> {
        this._own(item);
        this.items().push(item);
        yield* this._updated();
    }
}
export class UnorderedSpread<T extends Owned> extends Unordered<T> {
    constructor() {super()}
}
export class Ordered<T extends Owned> extends Area<T> {
    constructor() {super()}

    * shuffle(): GameGenerator<void> {
        jsShuffle(this.items());
        yield* this._updated();
    }
}
export class OrderedPile<T extends Owned> extends Ordered<T> {
    constructor() {super()}
    
    top(): T | undefined {
        return this.items()[0];
    }
    * addTop(item: T): GameGenerator<void> {
        this._own(item);
        this.items().push(item);
        yield* this._updated();
    }
}
export class OrderedRing<T extends Owned> extends Ordered<T> {
    constructor() {super()}
    * initializeClockwise(items: T[]): GameGenerator<void> {
        if (this.items.length !== 0) error("can't initialize already full ring");
        for (const item of items) this.items().push(item);
        yield* this._updated();
    }

    offset(item: T, direction: "cw" | "ccw", offset: number): T {
        const idx = this.items().indexOf(item);
        if (idx === -1) unreachable("can't after; not in pile");
        return this.items()[jsMod(idx + offset * (direction === "ccw" ? -1 : 1), this.items().length)]!;
    }
    clockwiseNext(item: T): T {
        return this.offset(item, "cw", 1);
    }
}

export type CardSuit = "D" | "H" | "C" | "S";
export type CardValue = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export class Card extends Owned {
    constructor(public suit: CardSuit, public number: CardValue) {super()}
}
export class Player extends Owned {}



export type GameGenerator<T> = Generator<GameYieldArg, T, GameYieldRet>;

export type FnArgData<Fn extends (player: Player, data: any) => unknown> = Fn extends (player: Player, a0: infer T) => unknown ? T : never;
export type WaitActionRet<T extends Record<string, (player: Player, data: any) => boolean>> = {[key in keyof T]: {kind: key, player: Player, value: FnArgData<T[key]>}}[keyof T];
export function* waitAction<T extends Record<string, (player: Player, data: any) => boolean>>(args: T): GameGenerator<WaitActionRet<NoInfer<T>>> {
    error("todo");
}

export type GameYieldArg = {todo2: true};
export type GameYieldRet = {todo: true};

// this can't happen but it is mentioned in the rules
export function error(msg: string): never {
    throw new Error(msg);
}
// this can't happen - it's not mentioned in the rules
export function unreachable(why: string): never {
    error(why);
}
export function never(v: never): never {
    unreachable("never");
}


export class Effect<Result> extends Error {
    _result: Result;
    constructor() {
        super("effect");
        this._result = 0 as any;
    }
}
export function* effect<Result>(effect: Effect<Result>): GameGenerator<NoInfer<Result>> {
    throw effect; // TODO: we will need a custom handlers map, we can't use throw. we will only throw if the effect needs to exit and not continue.
    // we'll probably need handleEffects to be a generator or something
}

export function jsShuffle<T>(array: T[]): T[] {
    let current_index = array.length;
    while (current_index != 0) {
        const random_index = Math.floor(Math.random() * current_index);
        current_index--;

        [array[current_index], array[random_index]] = [array[random_index]!, array[current_index]!];
    }
  
    return array;
};
export function jsMod(a: number, n: number): number {
    return ((a % n) + n) % n;
}
