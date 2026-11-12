// Addresses that are presets (the address itself is the setup: address.ts).

/** the string quintet (sent to Stephen): two violins, viola, cello and double bass, each line by its
 *  track name and General MIDI program (40/40/41/42/43), so Max Richter's "On the Nature of Daylight"
 *  (Violin I, Violin II, Viola, Violoncello, Contrabass) dropped on it plays on them as written */
export const QUINTET = '/orchestra?v=1&seats=violin,violin,viola,cello,bass&lines=Violin+I~40:1,Violin+II~40:2,Viola~41:3,Cello~42:4,Contrabass~43:5';

/** Beethoven's Fifth (the symphony's orchestra, in the score's order): two each of flutes, oboes, clarinets,
 *  bassoons, horns and trumpets, the timpani, two violins, viola, cello and double bass, each of Mutopia's
 *  twelve staves by its name ("one" … "twelve") and program; the horns' and trumpets' staves ("five", "six",
 *  both "english horn", GM 69) reach the horns and trumpets by name. A wind staff on two seats is divided
 *  between them (orchestra/assign.ts deskOf) */
export const SYMPHONY =
  '/orchestra?v=1&seats=flute,flute,oboe,oboe,clarinet,clarinet,bassoon,bassoon,horn,horn,trumpet,trumpet,timpani,violin,violin,viola,cello,bass' +
  '&lines=one~73:1.2,two~68:3.4,three~71:5.6,four~70:7.8,five~69:9.10,six~69:11.12,seven~47:13,eight~40:14,nine~40:15,ten~41:16,eleven~42:17,twelve~43:18';

/** thirteen players, one of each wind and brass, the timpani and the strings, each line by its name and
 *  program: the orchestra of "Toward Morning" (orchestra/pieces.ts), whose own address is /symphony. This
 *  one is the Orchestra's, the same seats and lines written out: its play icon plays the piece too */
export const THIRTEEN =
  '/orchestra?v=1&seats=flute,oboe,clarinet,bassoon,horn,trumpet,trombone,timpani,violin,violin,viola,cello,bass' +
  '&lines=Flute~73:1,Oboe~68:2,Clarinet~71:3,Bassoon~70:4,Horn~60:5,Trumpet~56:6,Trombone~57:7,Timpani~47:8,Violin+I~40:9,Violin+II~40:10,Viola~41:11,Cello~42:12,Double+Bass~43:13';

/** eleven players: flute, clarinet, horn, glockenspiel, harp, a grand, two violins, viola, cello and double
 *  bass, each line by its name and program: the orchestra of "Everything So Far" (orchestra/pieces.ts),
 *  whose own address is /everything. This one is the Orchestra's, the same seats and lines written out: its
 *  play icon plays the piece too */
export const ELEVEN =
  '/orchestra?v=1&seats=flute,clarinet,horn,glockenspiel,harp,grand,violin,violin,viola,cello,bass' +
  '&lines=Flute~73:1,Clarinet~71:2,Horn~60:3,Glockenspiel~9:4,Harp~46:5,Grand+Piano~0:6,Violin+I~40:7,Violin+II~40:8,Viola~41:9,Cello~42:10,Double+Bass~43:11';

/** seventeen players, every instrument of the page: the orchestra of "Pass It On" (orchestra/pieces.ts), whose
 *  own address is /passiton. This one is the Orchestra's, the same seats and lines written out: its play icon
 *  plays the piece too */
export const SEVENTEEN =
  '/orchestra?v=1&seats=flute,oboe,clarinet,bassoon,horn,trumpet,trombone,tuba,timpani,glockenspiel,harp,grand,violin,violin,viola,cello,bass' +
  '&lines=Flute~73:1,Oboe~68:2,Clarinet~71:3,Bassoon~70:4,Horn~60:5,Trumpet~56:6,Trombone~57:7,Tuba~58:8,Timpani~47:9,Glockenspiel~9:10,Harp~46:11,Grand+Piano~0:12,Violin+I~40:13,Violin+II~40:14,Viola~41:15,Cello~42:16,Double+Bass~43:17';
