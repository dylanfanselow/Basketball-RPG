/**
 * Round 88 (owner): the loading screen's tips (one at random at the bottom while the players' sprites are drawn).
 * PlayStation labels; no em dashes.
 */
export const TIPS = [
  'L1 is back everywhere: menus, workouts, the pause screen.',
  'Hold R1 to show your teammates\' icons, then press one to pass straight to him.',
  'Hold L2 to post up. Lean on him, then spin, hook or fade out of it.',
  'Everyone can Step-Through: pump fake, stick toward the rim, then ✕.',
  'Watch the contest cone: the less of it a defender covers, the better your look.',
  'There\'s no shot meter in games. Take open shots and your rating does the rest.',
  'The top bar is your rhythm. Fill it with good plays and your ultimate is ready once a game.',
  'Your teammates pass on trust and openness, never on demand. Play the right way and the ball finds you.',
  'Call for the ball with △. Whether it comes depends on how much they trust you.',
  'Box out before you chase the rebound. Position beats leaping.',
  'A pump fake works best after you\'ve made them respect your shot.',
  'Every workout rep costs energy. When the bar is empty, sleep it back.',
  'On an event day you can\'t work out before you go. Save it for the court.',
  'At the combine a perfect release is worth two points, and the green gets tighter every make.',
  'The draft follows how you play: the combine, the scrimmage, your big games.',
  'A good tryout makes that team more likely to take you on draft night. A bad one, less.',
  'Call Mom on the landline. She always knows what to say.',
  'Garcia picks up any time. Ask him where you stand.',
  'Perfect releases in a row build a streak. Beat your record for a NEW RECORD.',
  'Open layups go in. Get to the rim before the help does.',
];
export const randomTip = () => TIPS[Math.floor(Math.random() * TIPS.length) % TIPS.length];
