/**
 * Emergency protocols for Sol: the exact, ordered actions to take right now.
 *
 * Covers crew medical emergencies (first aid only — no medicines, doses or
 * diagnoses; treatment is always the crew medical officer's call) and habitat
 * emergencies (fire, pressure leak, toxic air, radiation storm, power loss…).
 *
 * Replies are built to be spoken fast: an opening that has a pre-recorded alert
 * clip, then the first few steps, then "say next" for the rest. Pure and tested.
 */
import { URGENT_CREW, URGENT_HABITAT } from './urgentSpeech';

/** crew: medical officer needed now (Emergency Mode); minor: first aid you can do yourself. */
export type EmergencyScope = 'crew' | 'minor' | 'habitat' | 'calm' | 'triage';

export interface EmergencyProtocol {
  id: string;
  /** short name, spoken after the opening ("Severe bleeding.") */
  label: string;
  scope: EmergencyScope;
  pattern: RegExp;
  /** every action, most important first */
  steps: string[];
}

/** Steps spoken per turn: short enough to act on, "next" gives the rest. */
export const STEPS_PER_TURN = 3;


/**
 * Order matters: the first match wins, so the most life-threatening come first
 * (a cardiac arrest outranks the chest pain that may come with it).
 */
export const EMERGENCIES: EmergencyProtocol[] = [
  {
    id: 'cardiac-arrest', label: 'Not breathing or unresponsive', scope: 'crew',
    pattern: /\b(?:unconscious|unresponsive|not responding|won'?t wake(?: up)?|not waking(?: up)?|can'?t wake (?:him|her|them)|(?:is ?n[o']?t|not|stopped|isn'?t|no longer) breathing|no pulse|no heartbeat|cardiac arrest|collapsed|cpr)\b/i,
    steps: [
      'Shout their name and tap both shoulders. Watch the chest for breathing, up to 10 seconds.',
      'Not breathing normally? Push the centre of the chest 30 times: hard and fast, 5 to 6 centimetres deep, 100 to 120 a minute.',
      'Trained? Then give 2 rescue breaths. If not, skip the breaths. Repeat 30 pushes, 2 breaths, without stopping.',
      'Get the defibrillator, switch it on and do exactly what it says.',
      'In microgravity, strap them to a flat surface or wedge them against a wall, and anchor your feet.',
      'Swap rescuers every 2 minutes, about 5 rounds of 30. Stop only when they breathe or the medical officer takes over.',
      'Breathing again? Roll them onto their side and stay with them.',
    ],
  },
  {
    id: 'choking', label: 'Choking', scope: 'crew',
    pattern: /\b(?:chok(?:e|es|ed|ing)|something(?:'?s| is)? stuck in (?:my|his|her|their) (?:throat|windpipe))\b/i,
    steps: [
      'Can they cough? Tell them to keep coughing hard.',
      'Can’t cough, speak or breathe? Give 5 sharp back blows between the shoulder blades.',
      'Then 5 abdominal thrusts: from behind, fist just above the belly button, pull in and up. Brace against a wall.',
      'Repeat 5 blows and 5 thrusts until the object comes out.',
      'Alone? Thrust your upper belly hard against a firm edge, 5 times, and repeat.',
      'Goes unresponsive? Start CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'nosebleed', label: 'Nosebleed', scope: 'minor',
    pattern: /\b(?:nose ?bleed(?:ing)?|bleeding (?:from )?(?:my|his|her|their|the) nose|(?:my|his|her|their) nose is bleeding|bloody nose)\b/i,
    steps: [
      'Sit up and lean slightly forward. Do not tip the head back.',
      'Pinch the soft part of the nose firmly for 10 minutes without letting go. Breathe through your mouth.',
      'Still bleeding? Pinch for another 10 minutes. In microgravity, catch drops with a cloth.',
      'Bleeding over 20 minutes, very heavy, or after a head injury? Medical officer now.',
    ],
  },
  {
    id: 'impaled', label: 'Object stuck in the body', scope: 'crew',
    pattern: /\b(?:impaled|(?:something|a piece of \w+|metal|glass|a rod|a tool) (?:is )?(?:stuck|sticking|lodged) (?:in|into|out of) (?:my|his|her|their) (?!throat|windpipe|eye)\w+)\b/i,
    steps: [
      'Do not pull the object out: it may be holding back bleeding.',
      'Press around the object, not on it, with clean cloths.',
      'Pad both sides so it cannot move, and tape the padding in place.',
      'Keep them still, lying down, and watch for pale, cold, sweaty skin.',
    ],
  },
  {
    id: 'crush', label: 'Crush injury', scope: 'crew',
    pattern: /\b(?:crushed|trapped (?:under|in|by)|pinned (?:under|by)|caught in (?:the |a )?(?:hatch|door|machine|equipment))\b/i,
    steps: [
      'Make it safe first. Free them only if you can do it quickly and safely; note the time they were trapped.',
      'Press hard on any bleeding with a clean cloth.',
      'Lay them flat, keep them warm and still. Nothing to eat or drink.',
      'Watch breathing. Not breathing normally? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'bleeding', label: 'Severe bleeding', scope: 'crew',
    pattern: /\b(?:bleeding (?:heavily|badly|a lot|everywhere|won'?t stop)|severe bleeding|heavy bleeding|lots? of blood|blood (?:everywhere|is (?:pouring|spurting|gushing)|won'?t stop)|(?:can'?t|won'?t) stop (?:the )?bleeding|(?:deep|bad) (?:cut|wound|gash)|(?:is |are |i'?m |he'?s |she'?s )?bleeding|cut (?:my|his|her|their) \w+ (?:open|badly|deep(?:ly)?)|gash|stab(?:bed)?)\b/i,
    steps: [
      'Press hard on the wound with a clean cloth. Keep pressing for 10 minutes without lifting.',
      'Blood soaks through? Add more cloth on top. Never remove the first layer.',
      'Raise the wound above the heart. Put on gloves when someone brings them.',
      'Still pouring from an arm or leg and you’re trained? Tourniquet 5 to 8 centimetres above the wound. Note the time.',
      'Pale, cold, sweaty or confused? Lay them flat, raise the legs 30 centimetres, keep them warm.',
      'In microgravity, catch floating blood drops with cloths and protect everyone’s eyes.',
    ],
  },
  {
    id: 'chest-pain', label: 'Chest pain', scope: 'crew',
    pattern: /\b(?:chest pains?|pain in (?:my|his|her|their|the) chest|chest (?:hurts|is hurting|feels tight|tightness|pressure)|tight chest|crushing chest|heart attack|pain (?:going |spreading )?(?:down|into|in) (?:my|his|her|their) (?:left )?arm)\b/i,
    steps: [
      'Stop all activity. Sit or half-lie, and loosen anything tight.',
      'Note the time the pain started and whether it spreads to the arm, jaw or back.',
      'Bring the defibrillator next to them. Stay with them.',
      'No medicine unless the medical officer says so.',
      'Collapses or stops breathing normally? CPR: 30 pushes, 2 breaths, and use the defibrillator.',
    ],
  },
  {
    id: 'palpitations', label: 'Racing or irregular heartbeat', scope: 'crew',
    pattern: /\b(?:palpitations?|heart (?:is )?(?:racing|pounding|fluttering|skipping(?: beats)?|beating (?:really |very )?(?:fast|hard|irregularly))|racing heart|irregular heart ?beat|heart rate (?:is )?(?:very |really )?(?:high|fast))\b/i,
    steps: [
      'Stop and sit down.',
      'Count your pulse for 30 seconds and double it. Note if the beat is regular or irregular.',
      'Breathe in for 4 seconds, out for 6. Repeat 10 times.',
      'Count again after 5 minutes. Still over 120 at rest, or chest pain, fainting or breathlessness? Medical officer now.',
      'No exercise or caffeine until the medical officer checks you.',
    ],
  },
  {
    id: 'spinal', label: 'Possible neck or back injury', scope: 'crew',
    pattern: /\b(?:neck injury|back injury|spin(?:e|al) injury|(?:hurt|injured|broke) (?:my|his|her|their) (?:neck|back|spine)|can'?t (?:feel|move) (?:my|his|her|their) legs|numb(?:ness)? in (?:both )?(?:my|his|her|their) legs after)\b/i,
    steps: [
      'Do not move them unless they are in danger.',
      'Hold the head still with a hand on each side, in line with the body.',
      'Keep talking to them and watch their breathing.',
      'Not breathing normally? CPR: 30 pushes, 2 breaths, keeping the head in line as much as you can.',
    ],
  },
  {
    id: 'stroke', label: 'Possible stroke', scope: 'crew',
    pattern: /\b(?:stroke|face (?:is )?droop\w*|droopy face|slurr\w* (?:speech|words)|speech (?:is )?slurr\w*|one side (?:of (?:my|his|her|their) (?:body|face) )?(?:is |feels )?(?:numb|weak|paralys\w*)|can'?t (?:move|feel) (?:my|his|her|their) (?:arm|leg|left side|right side))\b/i,
    steps: [
      'Note the exact time the signs started.',
      'Check FAST: face drooping, one arm weak, speech slurred. Any one of these means a possible stroke.',
      'Keep them still, head and shoulders slightly raised.',
      'Nothing to eat or drink.',
      'Unresponsive but breathing? On their side. Not breathing? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'seizure', label: 'Seizure', scope: 'crew',
    pattern: /\b(?:seizures?|seizing|convuls\w*|fitting|epileptic|having a fit|shaking uncontrollably)\b/i,
    steps: [
      'Start timing now.',
      'Move hard objects away. Do not hold them down.',
      'Cushion the head. Nothing in the mouth.',
      'Shaking stops? Roll them onto their side and check breathing.',
      'Over 5 minutes, or a second seizure? Medical officer immediately.',
      'Stay with them until fully awake.',
    ],
  },
  {
    id: 'allergy', label: 'Severe allergic reaction', scope: 'crew',
    pattern: /\b(?:anaphyla\w*|(?:severe |bad )?allergic reaction|(?:throat|tongue|lips?|face) (?:is |are |feels )?(?:swelling|swollen|closing|tight)|hives all over)\b/i,
    steps: [
      'Get the medical officer now: they hold the emergency treatment.',
      'Remove the cause, if known.',
      'Breathing hard? Sit upright. Faint? Lie flat, legs raised 30 centimetres.',
      'Do not let them stand or walk.',
      'Stops breathing normally? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'asthma', label: 'Asthma attack', scope: 'crew',
    pattern: /\b(?:asthma(?: attack)?|wheez(?:e|es|ing)|tight chest and wheez\w*)\b/i,
    steps: [
      'Sit upright, leaning slightly forward. Do not lie down.',
      'Breathe slowly and steadily: in through the nose, out through pursed lips.',
      'Get the medical officer and the emergency kit now; they decide on treatment.',
      'Too breathless to speak, lips blue, or exhausted? It is critical: medical officer immediately.',
      'Stops breathing normally? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'decompression', label: 'Possible decompression sickness', scope: 'crew',
    pattern: /\b(?:decompression sickness|the bends|(?:joint|knee|shoulder|elbow) pain after (?:the |an? )?(?:eva|spacewalk)|(?:itch\w*|tingl\w*|numb\w*|rash) after (?:the |an? )?(?:eva|spacewalk))\b/i,
    steps: [
      'Stop all activity and lie still. Exercise makes it worse.',
      'Tell the medical officer and Mission Control now: treatment is repressurization, which they decide.',
      'Note when the spacewalk ended and when the symptoms started.',
      'Breathlessness, chest pain, confusion or weakness? Medical officer immediately.',
    ],
  },
  {
    id: 'breathing', label: 'Trouble breathing', scope: 'crew',
    pattern: /\b(?:can'?t breathe|cannot breathe|can'?t catch (?:my|his|her|their) breath|struggling to breathe|trouble breathing|difficulty breathing|hard to breathe|short(?:ness)? of breath|gasping(?: for air)?|lips (?:are |turning )?blue)\b/i,
    steps: [
      'Stop all activity. Sit upright and loosen anything at the chest or neck.',
      'Others feel it too? Emergency masks on, and check the oxygen and CO2 display.',
      'Breathe in through the nose for 2 seconds, out through pursed lips for 4. Repeat 10 times.',
      'Blue or grey lips, confusion or drowsiness? Medical officer immediately.',
      'Stops breathing normally? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'electric-shock', label: 'Electric shock', scope: 'crew',
    pattern: /\b(?:electric(?:al)? shock|electrocut\w*|got (?:a )?shock(?:ed)?|shocked by|touched a live wire)\b/i,
    steps: [
      'Don’t touch them. Cut the power at the switch or breaker first.',
      'Can’t cut it? Push them off the source with something dry and plastic.',
      'Not breathing normally? CPR: 30 pushes, 2 breaths, and use the defibrillator.',
      'Cool any burns with cool water for 20 minutes.',
      'The medical officer must check them even if they seem fine: the heart rhythm can change later.',
    ],
  },
  {
    id: 'shock', label: 'Shock', scope: 'crew',
    pattern: /\b(?:going into shock|(?:he'?s|she'?s|they'?re|he is|she is|they are) in shock|(?:pale|grey|gray),? cold and (?:clammy|sweaty)|cold,? clammy skin)\b/i,
    steps: [
      'Lay them flat and raise the legs 30 centimetres, unless that hurts an injury.',
      'Keep them warm with a blanket. Loosen tight clothing.',
      'Nothing to eat or drink.',
      'Check breathing every minute. Not breathing normally? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'head-injury', label: 'Head injury', scope: 'crew',
    pattern: /\b(?:head injury|hit (?:my|his|her|their) head|(?:banged|bumped|smashed|knocked) (?:my|his|her|their) head|concussion|blow to the head)\b/i,
    steps: [
      'Stop activity. Knocked out, even briefly? Medical officer now.',
      'Neck pain, numbness or tingling? Keep the head and neck completely still.',
      'Hold a wrapped cold pack on the bump for 20 minutes.',
      'Check them every 2 hours for 24 hours: worse headache, repeated vomiting, confusion, unusual sleepiness, unequal pupils, or clear fluid from the nose or ears.',
      'Any of those? Medical officer immediately. Don’t sleep alone tonight.',
    ],
  },
  {
    id: 'fracture', label: 'Possible broken bone', scope: 'crew',
    pattern: /\b(?:broken (?:bone|arm|leg|wrist|ankle|hand|foot|finger|toe|rib|collarbone)|broke (?:my|his|her|their) \w+|fractur\w*|dislocat\w*|bone (?:is )?sticking out)\b/i,
    steps: [
      'Keep it still, as found. Do not straighten it.',
      'Splint it with padding, tied above and below the injury.',
      'Bone through the skin? Cover it with a clean dressing and press around it, not on it.',
      'Wrapped cold pack for 20 minutes.',
      'Fingers or toes beyond it cold, blue or numb? Medical officer immediately.',
    ],
  },
  {
    id: 'burn', label: 'Burn', scope: 'crew',
    pattern: /\b(?:(?:i |i'?ve |he |she |they |got |just )?burn(?:ed|t) (?:my|his|her|their|him|her|them|myself)|got (?:a )?burn(?:ed|t)?|bad burn|a burn on|scald\w*|chemical burn)\b/i,
    steps: [
      'Move away from the heat and switch it off.',
      'Cool with cool running water or wet cloths for 20 minutes. No ice.',
      'Remove rings, watches and tight clothing nearby, unless stuck to the skin.',
      'Cover loosely with a clean non-stick dressing or plastic film. No creams. Don’t pop blisters.',
      'Bigger than a palm, on the face, hands, feet, groin or a joint, or electrical or chemical? Medical officer now.',
    ],
  },
  {
    id: 'eye', label: 'Something in the eye', scope: 'crew',
    pattern: /\b(?:(?:chemical|something|liquid|debris|dust|particle|metal|glass)s? (?:got |went |is |flew )?in (?:my|his|her|their) eyes?|eye (?:injury|splash)|splashed (?:in(?:to)? )?(?:my|his|her|their) eyes?)\b/i,
    steps: [
      'Don’t rub it.',
      'Flush with clean water for 15 minutes, eyelid held open, from the nose side outward.',
      'In microgravity, use the eyewash or a water bag and catch the water with a towel.',
      'Remove contact lenses only if they come out easily.',
      'Something stuck in it? Don’t pull it out. Cover both eyes loosely and get the medical officer.',
    ],
  },
  {
    id: 'faint', label: 'Fainting', scope: 'crew',
    pattern: /\b(?:fainted|passed out|blacked out|(?:about|going) to faint|feel(?:ing)? (?:like i'?m going to )?faint)\b/i,
    steps: [
      'Lie flat now and raise the legs 30 centimetres.',
      'Check breathing. Not awake in 1 minute and not breathing normally? CPR: 30 pushes, 2 breaths.',
      'Loosen tight clothing. Keep the air moving.',
      'Awake? Stay lying down for 10 minutes, then sit up slowly.',
      'Tell the medical officer about every faint.',
    ],
  },
  {
    id: 'abdominal', label: 'Severe belly pain', scope: 'crew',
    pattern: /\b(?:(?:severe|terrible|really bad|sharp|unbearable) (?:stomach|belly|abdominal|tummy) (?:pain|ache)|(?:stomach|belly|abdomen|tummy) (?:hurts|pain) (?:really )?(?:badly|a lot)|vomiting blood)\b/i,
    steps: [
      'Stop activity. Rest in the position that hurts least.',
      'No food and no medicine. Water only if the medical officer says so.',
      'Note where it hurts, when it started, and any vomiting, fever or blood.',
      'Pale, sweaty, confused or faint? Medical officer immediately.',
    ],
  },
  {
    id: 'low-sugar', label: 'Low blood sugar', scope: 'crew',
    pattern: /\b(?:low blood sugar|blood sugar (?:is )?(?:low|dropping|crashing)|hypo(?:glycaemi\w*|glycemi\w*)?|diabetic (?:emergency|attack)|shaky,? sweaty and confused)\b/i,
    steps: [
      'Sit them down.',
      'If they are awake and can swallow, give a sugary drink or sweets right away.',
      'Wait 15 minutes. Not better? Give sugar again. Once better, give a snack.',
      'Drowsy or unable to swallow? Nothing by mouth: on their side, medical officer now.',
    ],
  },
  {
    id: 'heat', label: 'Heat illness', scope: 'crew',
    pattern: /\b(?:heat ?stroke|heat exhaustion|(?:i'?m|i am|he'?s|she'?s|they'?re|feel(?:ing)?) (?:overheat(?:ed|ing)|way too hot)|too hot in (?:my|his|her|the) suit|very hot and confused)\b/i,
    steps: [
      'Move to the coolest module and lie down with the legs raised.',
      'Remove extra clothing. Cool the skin with wet cloths and moving air.',
      'Awake and not confused? Small sips of water, often.',
      'Confused, hot dry skin, or fainting? That is heat stroke: medical officer now, and keep cooling.',
    ],
  },
  {
    id: 'hypothermia', label: 'Too cold (hypothermia)', scope: 'crew',
    pattern: /\b(?:hypotherm\w*|can'?t stop shivering|freezing cold and (?:confused|drowsy|shivering)|frostbite)\b/i,
    steps: [
      'Move to a warm module. Replace wet clothing with dry.',
      'Wrap the body and head in blankets. Warm the core first, not the hands and feet.',
      'Awake? Give a warm, sweet drink. No rubbing, no direct heat on the skin.',
      'Drowsy, confused or stops shivering? Medical officer now.',
    ],
  },
  {
    id: 'poison', label: 'Swallowed something harmful', scope: 'crew',
    pattern: /\b(?:swallowed (?:a |some )?(?:chemical|cleaner|cleaning \w+|coolant|poison|something (?:toxic|poisonous|harmful))|drank (?:a |some )?(?:chemical|cleaner|coolant)|poison(?:ed|ing))\b/i,
    steps: [
      'Do not make them vomit.',
      'Rinse the mouth with water and spit it out. Keep the container or label.',
      'Note what it was, how much, and when.',
      'Medical officer now. Drowsy or not breathing normally? On their side, or CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'tooth', label: 'Knocked-out tooth', scope: 'minor',
    pattern: /\b(?:knocked (?:out )?(?:a |my |his |her )?tooth(?: out)?|tooth (?:fell|came|got knocked) out|lost a tooth)\b/i,
    steps: [
      'Hold the tooth by the crown, not the root. Do not scrub it.',
      'Rinse it briefly with clean water and push it back into its socket if you can.',
      'If not, keep it in milk or in the cheek, and bite on a clean cloth to stop bleeding.',
      'Medical officer within 30 minutes gives the best chance of saving it.',
    ],
  },
  {
    id: 'sprain', label: 'Sprain or strain', scope: 'minor',
    pattern: /\b(?:sprain(?:ed)?|twisted (?:my|his|her|their|an?) (?:ankle|knee|wrist)|rolled (?:my|his|her|their|an?) ankle|strain(?:ed)? (?:my|his|her|their|a) (?:muscle|back|neck))\b/i,
    steps: [
      'Rest it: stop using it.',
      'Hold a wrapped cold pack on it for 20 minutes, every 2 to 3 hours.',
      'Wrap it firmly with a bandage, not tight, and keep it raised.',
      'Cannot bear weight, the shape looks wrong, or numbness? Treat as a broken bone and tell the medical officer.',
    ],
  },
  {
    id: 'minor-cut', label: 'Small cut or graze', scope: 'minor',
    pattern: /\b(?:(?:small|minor|little|tiny) cut|cut (?:my|his|her|their) (?:finger|thumb|hand|arm|leg|knee|lip)|graze|scrape)\b/i,
    steps: [
      'Wash your hands, then rinse the cut under clean running water.',
      'Press with a clean cloth until it stops bleeding.',
      'Cover it with a clean dressing or plaster.',
      'Gaping, deep, still bleeding after 10 minutes, or red and swollen later? Tell the medical officer.',
    ],
  },
  {
    id: 'vomiting', label: 'Vomiting or diarrhoea', scope: 'minor',
    pattern: /\b(?:can'?t stop (?:vomiting|throwing up)|keep (?:vomiting|throwing up)|vomiting (?:a lot|all day|non-?stop)|diarrh(?:o)?ea)\b/i,
    steps: [
      'Rest, and keep a sickness bag close.',
      'Take small sips of fluid every few minutes, even if you cannot eat.',
      'Wash hands and clean surfaces: it may spread to the crew.',
      'Blood, unable to keep fluids down for 6 hours, dizziness, or a high temperature? Medical officer.',
    ],
  },
  {
    id: 'panic', label: 'Panic', scope: 'calm',
    pattern: /\b(?:panic attack|panicking|hyperventilat\w*|freaking out|can'?t calm down)\b/i,
    steps: [
      'Hold on to something solid.',
      'Breathe in through your nose for 4, hold for 4, out through your mouth for 6. Repeat 5 times.',
      'Name 5 things you see, 4 you can touch and 3 you hear.',
      'Get a crewmate to stay with you.',
      'Chest pain, or not settled in 10 minutes? Tell the medical officer.',
    ],
  },
  // Habitat emergencies.
  {
    id: 'fire', label: 'Fire or smoke', scope: 'habitat',
    pattern: /\b(?:fire\b(?! (?:up|off|away|drill))|on fire|flames?|smoke\b|smoky|smell(?:s|ing)? (?:of |like )?(?:smoke|burning)|something(?:'?s| is) burning|burning smell)/i,
    steps: [
      'Shout “fire” and press the fire alarm.',
      'Put on your emergency breathing mask.',
      'Safe to reach? Cut power and ventilation to that module.',
      'Small fire and trained? Extinguisher at the base of the flames, sweeping side to side. Never water on electrical fires.',
      'Not out in 10 seconds, or thick smoke? Leave, close the hatch and go to the safe haven.',
      'Count every crewmember. Follow the fire procedure with Mission Control.',
    ],
  },
  {
    id: 'pressure', label: 'Pressure leak', scope: 'habitat',
    pattern: /\b(?:depressuri[sz]\w*|(?:cabin )?pressure (?:is )?(?:dropping|falling|drop|leak|loss|going down)|losing (?:cabin )?pressure|air leak|leak(?:ing)? air|hull breach|we have a leak|there'?s a leak|hissing)\b/i,
    steps: [
      'Announce “pressure leak” and sound the alarm.',
      'Read the cabin pressure and how fast it is falling.',
      'Move to the safe module or return vehicle. Close each hatch behind you.',
      'Still falling fast? Suit or emergency mask on.',
      'Count everyone. Follow the depressurization procedure with Mission Control.',
    ],
  },
  {
    id: 'toxic', label: 'Toxic air', scope: 'habitat',
    pattern: /\b(?:ammonia|toxic (?:air|gas|leak|spill|fumes|atmosphere)|chemical (?:leak|spill|smell)|gas leak|fumes|smells? (?:like |of )?chemicals?|strange smell in the (?:air|cabin|module))\b/i,
    steps: [
      'Emergency breathing mask on now.',
      'Alert the crew and sound the toxic-air alarm.',
      'Leave the module and close the hatch behind you.',
      'On skin or in the eyes? Flush with water for 15 minutes.',
      'Count everyone in a clean module. Follow the toxic-release procedure with Mission Control.',
      'Cough, burning eyes or trouble breathing? Medical officer.',
    ],
  },
  {
    id: 'air', label: 'Bad cabin air', scope: 'habitat',
    pattern: /\b(?:oxygen (?:is |feels |seems |levels? (?:are |is )?)?(?:low|thin|dropping|running out)|low oxygen|not enough (?:oxygen|air)|air (?:is |feels )?(?:thin|stale|bad)|can'?t get (?:enough )?air|co2 (?:is |levels? (?:are |is )?)?(?:high|rising|too high)|high co2|scrubber (?:failed|failure|is down|stopped))\b/i,
    steps: [
      'Stop exercise and heavy work now.',
      'Read the oxygen and CO2 on the habitat display. The CO2 limit is 3 mmHg.',
      'Others feel it too, or readings off? Emergency masks on.',
      'Move to a module with good air. Check the fans and CO2 scrubber are running.',
      'Breathless, confused or very drowsy? Medical officer now.',
    ],
  },
  {
    id: 'radiation', label: 'Radiation storm', scope: 'habitat',
    pattern: /\b(?:solar (?:flare|storm|particle event)|radiation (?:alarm|alert|warning|storm|spike|is high|levels? (?:are |is )?(?:high|rising))|particle event|proton (?:storm|event))\b/i,
    steps: [
      'Go to the central storm shelter now.',
      'Spacewalkers: back to the airlock immediately.',
      'Bring your dosimeter. Pack water bags and supplies around you for shielding.',
      'All crew in the shelter within 5 minutes. Count everyone.',
      'Stay until every room reads 0.15 millisieverts per hour or less for 6 hours and Mission Control gives the all-clear.',
    ],
  },
  {
    id: 'eva', label: 'Spacesuit problem', scope: 'habitat',
    pattern: /\b(?:suit (?:leak|problem|alarm|pressure (?:is )?(?:low|dropping))|(?:space ?suit|eva) (?:emergency|problem|leak)|water in (?:my|the|his|her) helmet|helmet (?:is )?(?:filling|leaking)|lost (?:my )?tether)\b/i,
    steps: [
      'Tell your partner and Mission Control now.',
      'Stop work and check your tethers.',
      'Go straight back to the airlock.',
      'Water in the helmet? Keep your mouth and nose clear and keep moving.',
      'Repressurize as soon as you are both in. The medical officer checks you.',
    ],
  },
  {
    id: 'power', label: 'Power loss', scope: 'habitat',
    pattern: /\b(?:power (?:is )?(?:out|failure|loss|down|cut)|lost (?:all )?power|power outage|lights (?:went|are) out|station blackout|total blackout)\b/i,
    steps: [
      'Hold still. Emergency light on.',
      'Check the fans are moving air. Air turning stale? Emergency masks on.',
      'Gather at the safe point and count everyone.',
      'Follow the power-loss procedure with Mission Control. Restart nothing until told.',
    ],
  },
  {
    id: 'critical', label: 'Critical emergency', scope: 'crew',
    pattern: /\b(?:(?:i'?m|i am|he'?s|he is|she'?s|she is|they'?re|they are|someone'?s|someone is|we'?re|we are|(?:i|he|she) (?:think|feel|feels|thinks)(?: like)? (?:i'?m|he'?s|she'?s|i am)) (?:dying|dieing|going to die|gonna die|about to die|might die|not going to make it|not gonna make it)|(?:i|he|she|they|we) (?:might|could|will|may) die|i don'?t want to die|in (?:terrible|severe|extreme|unbearable|so much) pain|can'?t (?:take|stand) the pain|(?:help|please)[,!. ]+(?:i'?m|i am) dying)\b|^\W*(?:help[,!. ]*)?dying\W*$/i,
    steps: [
      'Tell me what is happening: chest pain, bleeding, can’t breathe, or pain where?',
      'Stay where you are. Don’t move unless it is unsafe.',
      'Not breathing? CPR: 30 pushes, 2 breaths.',
    ],
  },
  {
    id: 'alarm', label: 'Alarm', scope: 'habitat',
    pattern: /\b(?:alarm|siren|master (?:alarm|caution)|warning (?:light|tone) is (?:on|going))\b/i,
    steps: [
      'Read the alarm panel: which alarm is it?',
      'Go to the safe meeting point and count everyone.',
      'Tell me: fire, pressure leak or toxic air.',
    ],
  },
  {
    id: 'help', label: 'Emergency', scope: 'triage',
    // A bare call for help, not "help me with the check-in".
    pattern: /\b(?:emergency|mayday|sos|help(?:[,!. ]+help)+|(?:someone|somebody|he|she|they)(?:'?s| is| are) (?:hurt|injured)|i(?:'?m| am) (?:hurt|injured)|i got hurt|(?:i'?m|i am|we'?re|we are|(?:s?he|they)(?:'?s| is| are)) in (?:danger|trouble)|(?:i'?m|i am) not (?:ok|okay|alright|all right)(?! with)|something(?:'?s| is) (?:really |very |seriously )?wrong(?: with (?:me|him|her|them|us))?)\b|^\W*(?:help(?: me)?(?: now| please)?|i need help(?: now| right now)?|get help(?: now)?)\W*$/i,
    steps: [
      'Tell me what is happening: fire, bleeding, not breathing, chest pain or pressure leak?',
      'Someone not breathing? CPR: 30 pushes, 2 breaths, now.',
      'Not safe? Get yourself to safety first.',
    ],
  },
];

const BY_ID = new Map(EMERGENCIES.map((protocol) => [protocol.id, protocol]));
export const emergencyById = (id: string) => BY_ID.get(id);

// "What is a solar flare?" is a question about a topic, not an emergency…
const ASKING_ABOUT = /^\s*(?:what(?:'?s| is| are| does| causes?| happens)|why|define|explain|meaning of|tell me (?:about|what)|how (?:does|do|is|are|can|could) (?!i\b|we\b|you\b))/i;
// …unless it also says it is happening to someone here and now.
const HAPPENING = /\b(?:i|i'?m|i'?ve|me|my|we|we'?re|our|us|someone|somebody|he|she|they|his|her|their|crewmate|there'?s|right now|now|help|happening|just)\b/i;

/** The protocol for what was said, or null when it is not an emergency. */
export function matchEmergency(text: string): EmergencyProtocol | null {
  // Typed and transcribed text can use curly apostrophes ("can’t").
  const said = text.replace(/[’‘`]/g, "'").trim();
  if (!said) return null;
  if (ASKING_ABOUT.test(said) && !HAPPENING.test(said)) return null;
  // "The emergency is over", "false alarm": standing down, not a new emergency.
  if (EMERGENCY_STOP.test(said)) return null;
  return EMERGENCIES.find((protocol) => protocol.pattern.test(said)) ?? null;
}

/** A protocol detected without "Hey Sol": only clear, specific calls, never the generic alarm word. */
export function isEmergencyCall(text: string): boolean {
  const protocol = matchEmergency(text);
  return protocol !== null && protocol.id !== 'alarm';
}

/** Where the crew can follow up in the app. */
export function emergencySources(protocol: EmergencyProtocol): { label: string; route: string }[] {
  if (protocol.id === 'radiation') return [{ label: 'Radiation monitor · storm shelter', route: '/hazards/radiation' }];
  if (protocol.id === 'air') return [{ label: 'Habitat air on the Timeline', route: '/timeline' }];
  if (protocol.scope === 'habitat') return [];
  return [{ label: 'Crew medical officer console', route: '/cmo' }];
}

const OPENING: Record<EmergencyScope, string> = {
  crew: URGENT_CREW,
  minor: 'Here’s what to do.',
  habitat: URGENT_HABITAT,
  calm: 'Stop and breathe with me.',
  triage: URGENT_HABITAT,
};

export interface EmergencyTurn {
  text: string;
  /** the steps spoken this turn */
  steps: string[];
  /** number of the first step this turn (1-based) */
  start: number;
  /** index of the next unspoken step, or null when all were given */
  next: number | null;
}

/** Steps `from`…`from + STEPS_PER_TURN` of a protocol, ready to speak. */
export function emergencyTurn(protocol: EmergencyProtocol, from = 0): EmergencyTurn {
  const steps = protocol.steps.slice(from, from + STEPS_PER_TURN);
  const next = from + steps.length < protocol.steps.length ? from + steps.length : null;
  const numbered = steps.map((step, i) => `Step ${from + i + 1}: ${step}`).join(' ');
  const lead = from === 0 ? `${OPENING[protocol.scope]} ${protocol.scope === 'triage' ? '' : `${protocol.label}. `}` : '';
  const tail = next !== null
    ? 'Say “next” for more.'
    : protocol.scope === 'triage' ? '' : 'That’s all the steps. Say “repeat” to hear them again.';
  return { text: `${lead}${numbered} ${tail}`.replace(/\s+/g, ' ').trim(), steps, start: from + 1, next };
}

// Follow-ups while an emergency is being handled.
export const EMERGENCY_NEXT = /^(?:(?:ok(?:ay)?|right|yes|yeah|got it|done)[\s,.!]*)*(?:next(?: step| steps| one)?|what(?:'?s| is)? next|then what|what now|now what|and then\??|continue|go on|keep going|done|did (?:it|that)|i did (?:it|that)|what else|more|ok(?:ay)?|got it)?[\s.!?]*$/i;
export const EMERGENCY_REPEAT = /^(?:(?:sorry|what)[\s,.!?]*)?(?:repeat(?: that| it| the steps)?|say (?:it|that) again|again|come again|pardon|i didn'?t (?:hear|get|catch) (?:that|it|you)|what do i do|what should i do|what (?:do|should) we do|start again|from the (?:start|top|beginning)|what\??|sorry\??)[\s.!?]*$/i;
export const EMERGENCY_STOP = /^(?:(?:ok(?:ay)?|sol|soul|hey sol|right|good news|thank god|phew|and|so|well|yes|yeah|alright|all right|now)[\s,.!]+)*(?:stop|cancel|all clear|stand down|false alarm|never ?mind|(?:it'?s|it is) (?:over|ok|okay|fine|alright|all right|under control)(?: now)?|(?:the )?(?:emergency|danger|crisis) (?:is |has )?(?:over|ended|finished|done|resolved|passed)|(?:the )?emergency'?s over|(?:cancel|end|stop) (?:the )?emergency(?: mode)?|no (?:more )?emergency|(?:the )?situation(?:'?s| is) under control|everything(?:'?s| is) (?:ok|okay|fine|alright|all right|good|under control)(?: now)?|all (?:is )?(?:good|well|fine)(?: now)?|we(?:'?re| are) (?:ok|okay|safe|fine|good|alright|all right|out of danger)(?: now)?|(?:she|he|they|i|we)(?:'?s|'?m|'?re| is| am| are) (?:ok|okay|fine|safe|better|stable|alright|all right|good|out of danger|breathing(?: again)?|awake)(?: now)?(?: again)?)(?:[\s,.!]+(?:now|thanks|thank you|sol|soul|again))*[\s.!]*$/i;
