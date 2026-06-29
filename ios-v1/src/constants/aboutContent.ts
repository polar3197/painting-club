// "About the app" content model.
//   About hub  → sections (ethos / art / aims)
//   Section    → a list of post titles
//   Post       → a white blog page rendering its blocks in order
// Blocks are an ordered list so a post's words stay exactly as written.

export type AboutSectionKey = 'ethos' | 'art' | 'aims';

export type AboutBlock =
  | { type: 'quote'; text: string; attrib: string }
  | { type: 'p'; text: string }
  | { type: 'bullets'; items: string[] };

export type AboutPost = { title: string; blocks: AboutBlock[] };

export const ABOUT_SECTIONS: { key: AboutSectionKey; label: string }[] = [
  { key: 'ethos', label: 'ethos' },
  { key: 'art', label: 'art' },
  { key: 'aims', label: 'aims' },
];

export const ABOUT_POSTS: Record<AboutSectionKey, AboutPost[]> = {
  ethos: [
    {
      title: 'Painting Club Ethos',
      blocks: [
        {
          type: 'quote',
          text:
            '"Underlying [the Web\'s] whole infrastructure was the intention to allow for collaboration, foster compassion and generate creativity — what I term the 3 C\'s. It was to be a tool to empower humanity. [...] Yet in the past decade, instead of embodying these values, the web has instead played a part in eroding them."',
          attrib: '- Tim Berners-Lee (creator of the World Wide Web)',
        },
        {
          type: 'p',
          text:
            'This is a general introduction to the spirit of Painting Club. Actually this is all gibberish, an official and succinct doc will be written and placed here to communicate what is achieved here and why it is fun and philosophically important.',
        },
        {
          type: 'p',
          text:
            'Painting Club is a big bet on my hope that community is more powerful than dopamine kicks.',
        },
        {
          type: 'p',
          text:
            'Online participation has become co-opted and turned into continual and pervasive exploitation and mental-priming of vulnerable, isolated people, by powerful idiots. — why do we enter this contract? For a fun way to connect with our friends over the internet.',
        },
        {
          type: 'p',
          text:
            'You have to be one sick mofo to prey upon people\'s desire to have connection and community. Connection is the purest and most fragile human desire —and Zuck twists and corrupts it before it can even stand up on its own.',
        },
        {
          type: 'p',
          text:
            'Social connection should not be monetized. Annnnd, that brings us to the four tenants of Painting Club',
        },
        {
          type: 'bullets',
          items: [
            '1. no dopamine hooks',
            '2. sincerity as the metric',
            '3. no advertising',
            '4. no ai (not in a reactionary way, in a humanane way)',
          ],
        },
        {
          type: 'p',
          text:
            'Some people might say "no dopamine hooks? how will you get people to use the app?" or "why would people choose painting club over instagram/tiktok?". These questions miss the point. The goal is not to get users; the goal is not to harvest attention; the goal is not to coerce members into participating. The goal is to provide an alternative.',
        },
      ],
    },
  ],
  art: [],
  aims: [],
};
