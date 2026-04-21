goal
- formalize every card game I know

client-server:
- when waitActionScreen:
  - we send every player's views to the players along with the action screen (with an id)
  - we wait until we get a response for that action screen we sent (same id)
  - then we apply and continue

once complete, where to go from here?
- formalize views
- translate to lean
- in lean we could prove things about games, eg:
  - it is always possible for a player to take a turn
    - ie an action is never unfulfillable
  - can every player know what moves are legal for them based on their view of the game
  - after a player selects a move, can every other player determine if that move was legal based on their views of the game?

printing:
- it's interesting how you have to program differently (worse) to match speech better sometimes
