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
