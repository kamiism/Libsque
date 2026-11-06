// Original indie-editorial SVG illustrations for LIBSQUE
// Summer Ocean Breeze Palette: Deep Navy (#1D3557), Coral Red (#E73847), Seafoam (#A8DADB), Ocean Blue (#457B9D), Soft Mint (#F0FAEF)

export function ReaderRooftop({ className = "w-full max-w-sm h-auto" }) {
  return (
    <svg viewBox="0 0 360 260" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="A reader on a rooftop under the evening stars">
      {/* Sky backdrop with soft twilight gradient */}
      <rect x="10" y="10" width="340" height="240" rx="16" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2" strokeDasharray="4 4" />
      
      {/* Stars & Crescent Moon */}
      <path d="M290 40C282 40 275 46 275 55C275 64 282 70 290 70C286 68 283 62 283 55C283 48 286 42 290 40Z" fill="#E73847" />
      <circle cx="60" cy="50" r="2" fill="#457B9D" />
      <circle cx="120" cy="35" r="1.5" fill="#457B9D" />
      <circle cx="210" cy="45" r="2" fill="#457B9D" />
      <circle cx="160" cy="70" r="1.5" fill="#E73847" />
      <circle cx="320" cy="90" r="2" fill="#457B9D" />

      {/* Rooftop ledge & brickwork */}
      <rect x="30" y="190" width="300" height="40" rx="4" fill="#A8DADB" stroke="#1D3557" strokeWidth="2.5" />
      <line x1="110" y1="190" x2="110" y2="230" stroke="#1D3557" strokeWidth="2" />
      <line x1="190" y1="190" x2="190" y2="230" stroke="#1D3557" strokeWidth="2" />
      <line x1="270" y1="190" x2="270" y2="230" stroke="#1D3557" strokeWidth="2" />
      <line x1="30" y1="210" x2="330" y2="210" stroke="#1D3557" strokeWidth="1.5" />

      {/* Chimney silhouette in background */}
      <rect x="50" y="140" width="30" height="50" fill="#457B9D" opacity="0.3" />
      <rect x="46" y="136" width="38" height="6" fill="#1D3557" opacity="0.4" />

      {/* Solitary reader sitting on rooftop ledge */}
      {/* Legs dangling */}
      <path d="M190 190V215" stroke="#1D3557" strokeWidth="7" strokeLinecap="round" />
      <path d="M180 190V220" stroke="#1D3557" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="192" cy="218" rx="5" ry="3" fill="#E73847" />
      <ellipse cx="182" cy="223" rx="5" ry="3" fill="#E73847" />

      {/* Torso & Sweater */}
      <path d="M165 150C165 138 195 138 198 150L200 190H165L165 150Z" fill="#457B9D" stroke="#1D3557" strokeWidth="2.5" />
      {/* Scarf / Collar Accent */}
      <path d="M170 148C176 153 188 153 194 148" stroke="#E73847" strokeWidth="4" strokeLinecap="round" />

      {/* Head & Hair */}
      <circle cx="180" cy="125" r="14" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2.5" />
      <path d="M168 122C170 114 180 112 188 114C194 116 195 125 195 125C190 120 178 120 168 122Z" fill="#1D3557" />

      {/* Open Book held in hands */}
      <path d="M178 160L165 170L150 165L163 155Z" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <path d="M178 160L191 170L206 165L193 155Z" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      {/* Book Cover Edge */}
      <path d="M149 166L164 171L178 161L192 171L207 166" stroke="#E73847" strokeWidth="2" />

      {/* Reading Mug nearby */}
      <rect x="235" y="174" width="12" height="16" rx="2" fill="#E73847" stroke="#1D3557" strokeWidth="2" />
      <path d="M247 178C250 178 250 184 247 184" stroke="#1D3557" strokeWidth="1.5" />
      <path d="M239 168C239 165 243 164 241 160" stroke="#457B9D" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SharedBench({ className = "w-full max-w-md h-auto" }) {
  return (
    <svg viewBox="0 0 380 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Two readers on a shared bench reading together">
      {/* Park Bench Architecture */}
      {/* Bench backrest rails */}
      <rect x="25" y="90" width="330" height="6" rx="2" fill="#A8DADB" stroke="#1D3557" strokeWidth="2" />
      <rect x="25" y="104" width="330" height="6" rx="2" fill="#A8DADB" stroke="#1D3557" strokeWidth="2" />

      {/* Bench seat slats */}
      <rect x="20" y="126" width="340" height="10" rx="3" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2.5" />

      {/* Cast-iron legs & supports */}
      <path d="M45 136V185M45 185H38M45 185H52" stroke="#1D3557" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M335 136V185M335 185H328M335 185H342" stroke="#1D3557" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M190 136V185" stroke="#1D3557" strokeWidth="3" strokeLinecap="round" />
      {/* Subtle backrest upright posts */}
      <line x1="48" y1="88" x2="48" y2="126" stroke="#1D3557" strokeWidth="3" />
      <line x1="332" y1="88" x2="332" y2="126" stroke="#1D3557" strokeWidth="3" />
      <line x1="190" y1="88" x2="190" y2="126" stroke="#1D3557" strokeWidth="2" />

      {/* GROUND SHADOW */}
      <ellipse cx="190" cy="188" rx="160" ry="4" fill="#1D3557" opacity="0.12" />

      {/* ========================================================
          READER 1 (Left) - Engrossed reader, messy hair & glasses,
          cozy knit sweater, holding book close
          ======================================================== */}
      {/* Legs & crossed ankles */}
      <path d="M85 134L80 168L92 182" stroke="#1D3557" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M102 134L105 165L96 182" stroke="#1D3557" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {/* Shoes - Coral Red sneakers with white soles */}
      <ellipse cx="88" cy="184" rx="8" ry="4" fill="#E73847" />
      <path d="M80 186H96" stroke="#FFFFFF" strokeWidth="1.5" />
      <ellipse cx="104" cy="184" rx="8" ry="4" fill="#E73847" />
      <path d="M96 186H112" stroke="#FFFFFF" strokeWidth="1.5" />

      {/* Torso - Seafoam chunky sweater with rolled collar */}
      <path d="M72 85C72 75 118 75 120 85L124 134H70L72 85Z" fill="#A8DADB" stroke="#1D3557" strokeWidth="2.5" />
      {/* Sweater pattern / texture lines */}
      <path d="M82 92V130M96 90V130M110 92V130" stroke="#1D3557" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
      {/* Coral Neckline accent */}
      <path d="M86 78C92 84 102 84 108 78" stroke="#E73847" strokeWidth="3.5" strokeLinecap="round" />

      {/* Head, Glasses & Tousled Hair */}
      <circle cx="97" cy="58" r="14" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2.5" />
      {/* Distinctive wavy/curly messy hair */}
      <path d="M84 56C82 43 94 38 106 40C114 42 116 50 114 56C112 50 106 47 98 48C90 49 86 52 84 56Z" fill="#1D3557" />
      <path d="M82 54C80 50 82 45 86 44" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      <path d="M109 46C114 48 116 53 115 57" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      {/* Wireframe Reading Glasses */}
      <circle cx="93" cy="59" r="4.5" stroke="#1D3557" strokeWidth="1.5" fill="none" />
      <circle cx="103" cy="59" r="4.5" stroke="#1D3557" strokeWidth="1.5" fill="none" />
      <line x1="97.5" y1="59" x2="98.5" y2="59" stroke="#1D3557" strokeWidth="1.5" />

      {/* Arms & Hands holding hardcover book up */}
      <path d="M72 96L84 108L90 102" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 96L110 108L104 102" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Book 1 - Open Hardcover with Deep Navy covers and white pages */}
      <path d="M97 98L83 110L68 104L82 92Z" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <path d="M97 98L111 110L126 104L112 92Z" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <path d="M67 105L83 111L97 99L111 111L127 105" stroke="#1D3557" strokeWidth="2.5" />
      <line x1="74" y1="99" x2="88" y2="105" stroke="#457B9D" strokeWidth="1" />
      <line x1="106" y1="105" x2="120" y2="99" stroke="#457B9D" strokeWidth="1" />

      {/* ========================================================
          BETWEEN THEM: Stack of books & subtle spark of shared wavelength
          ======================================================== */}
      {/* Small stack of 2 books on bench */}
      <rect x="175" y="120" width="30" height="6" rx="1" fill="#E73847" stroke="#1D3557" strokeWidth="1.5" />
      <rect x="178" y="114" width="25" height="6" rx="1" fill="#457B9D" stroke="#1D3557" strokeWidth="1.5" />
      <line x1="181" y1="117" x2="200" y2="117" stroke="#FFFFFF" strokeWidth="1" opacity="0.8" />
      {/* Subtle literary spark */}
      <circle cx="190" cy="55" r="3.5" fill="#E73847" />
      <path d="M185 45C188 43 192 43 195 45" stroke="#457B9D" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M183 65C187 67 193 67 197 65" stroke="#457B9D" strokeWidth="1.5" strokeLinecap="round" />

      {/* ========================================================
          READER 2 (Right) - Elegant posture, chic topknot bun,
          Ocean Blue trench/cardigan, bookmark in fingers
          ======================================================== */}
      {/* Legs - straight down, neat ankle boots */}
      <path d="M265 134V172" stroke="#1D3557" strokeWidth="7" strokeLinecap="round" />
      <path d="M280 134V172" stroke="#1D3557" strokeWidth="7" strokeLinecap="round" />
      {/* Boots - Deep Navy boots */}
      <path d="M261 172H271L272 184H258L261 172Z" fill="#1D3557" />
      <path d="M276 172H286L287 184H273L276 172Z" fill="#1D3557" />

      {/* Torso - Ocean Blue coat with notched lapels */}
      <path d="M252 85C252 75 296 75 298 85L302 134H248L252 85Z" fill="#457B9D" stroke="#1D3557" strokeWidth="2.5" />
      {/* Cream inner tee showing at collar */}
      <path d="M266 78L275 92L284 78" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2" />
      {/* Lapel lines */}
      <path d="M258 84L268 110M292 84L282 110" stroke="#1D3557" strokeWidth="1.5" />

      {/* Head & High Bun Hair with Coral Tie */}
      <circle cx="275" cy="58" r="14" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2.5" />
      {/* Sleek hair with side-swept fringe */}
      <path d="M263 56C263 42 287 42 288 56C284 50 270 50 263 56Z" fill="#1D3557" />
      {/* High topknot bun */}
      <circle cx="275" cy="40" r="7" fill="#1D3557" />
      {/* Coral scrunchie / tie */}
      <ellipse cx="275" cy="46" rx="5" ry="2.5" fill="#E73847" />

      {/* Arms & Hands holding book on lap */}
      <path d="M250 96L260 116H272" stroke="#1D3557" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M300 96L290 116H278" stroke="#1D3557" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Book 2 on lap - closed paperback with protruding ribbon */}
      <rect x="260" y="112" width="30" height="20" rx="2" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <rect x="260" y="112" width="6" height="20" fill="#E73847" stroke="#1D3557" strokeWidth="1.5" />
      {/* Silk ribbon bookmark dangling */}
      <path d="M276 112V136" stroke="#E73847" strokeWidth="2" strokeLinecap="round" />
      <path d="M276 136L279 141L276 139L273 141Z" fill="#E73847" />

      {/* Ambient delicate leaves */}
      <path d="M20 50C28 46 32 54 24 58C20 54 20 51 20 50Z" fill="#A8DADB" stroke="#1D3557" strokeWidth="1" />
      <path d="M355 42C363 38 367 46 359 50C355 46 355 43 355 42Z" fill="#A8DADB" stroke="#1D3557" strokeWidth="1" />
    </svg>
  );
}

export function BookstackWalker({ className = "w-full max-w-xs h-auto" }) {
  return (
    <svg viewBox="0 0 240 280" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="A reader carrying a giant armload of books">
      {/* Floating stars */}
      <circle cx="40" cy="50" r="2" fill="#E73847" />
      <circle cx="190" cy="40" r="2" fill="#457B9D" />
      <circle cx="210" cy="110" r="1.5" fill="#E73847" />

      {/* Walking legs */}
      <path d="M105 210L95 255" stroke="#1D3557" strokeWidth="6" strokeLinecap="round" />
      <path d="M135 210L145 255" stroke="#1D3557" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="90" cy="258" rx="8" ry="4" fill="#E73847" />
      <ellipse cx="150" cy="258" rx="8" ry="4" fill="#E73847" />

      {/* Torso */}
      <path d="M100 160C100 150 140 150 140 160L142 210H98L100 160Z" fill="#A8DADB" stroke="#1D3557" strokeWidth="2.5" />

      {/* Head peeking slightly from behind the stack */}
      <circle cx="108" cy="115" r="13" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2.5" />
      <path d="M96 115C96 102 120 102 120 115Z" fill="#1D3557" />
      <circle cx="104" cy="115" r="2" fill="#1D3557" />

      {/* Giant towering book stack */}
      {/* Book 1 (bottom) */}
      <rect x="75" y="170" width="90" height="16" rx="2" fill="#1D3557" stroke="#1D3557" strokeWidth="2" />
      <line x1="82" y1="174" x2="82" y2="182" stroke="#FFFFFF" strokeWidth="2" />
      {/* Book 2 */}
      <rect x="80" y="152" width="82" height="18" rx="2" fill="#E73847" stroke="#1D3557" strokeWidth="2" />
      <line x1="86" y1="156" x2="86" y2="166" stroke="#FFFFFF" strokeWidth="2" />
      {/* Book 3 */}
      <rect x="70" y="136" width="95" height="16" rx="2" fill="#457B9D" stroke="#1D3557" strokeWidth="2" />
      <line x1="78" y1="140" x2="78" y2="148" stroke="#FFFFFF" strokeWidth="2" />
      {/* Book 4 */}
      <rect x="85" y="120" width="75" height="16" rx="2" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <line x1="90" y1="124" x2="90" y2="132" stroke="#E73847" strokeWidth="2" />
      {/* Book 5 */}
      <rect x="78" y="104" width="84" height="16" rx="2" fill="#A8DADB" stroke="#1D3557" strokeWidth="2" />
      {/* Book 6 (top tilted precarious book) */}
      <g transform="rotate(-6 120 90)">
        <rect x="85" y="86" width="70" height="15" rx="2" fill="#E73847" stroke="#1D3557" strokeWidth="2" />
        <line x1="90" y1="90" x2="90" y2="97" stroke="#FFFFFF" strokeWidth="2" />
      </g>

      {/* Arms wrapped around the book stack */}
      <path d="M96 160C85 165 80 185 105 185" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" />
      <path d="M144 160C155 165 160 185 135 185" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function SecretNote({ className = "w-full max-w-xs h-auto" }) {
  return (
    <svg viewBox="0 0 240 220" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="A note slipped inside a beloved book">
      <rect x="10" y="10" width="220" height="200" rx="14" fill="#F0FAEF" stroke="#1D3557" strokeWidth="2" strokeDasharray="4 4" />
      {/* Open Book */}
      <path d="M120 60C140 50 180 50 200 60V170C180 160 140 160 120 170C100 160 60 160 40 170V60C60 50 100 50 120 60Z" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2.5" />
      <line x1="120" y1="60" x2="120" y2="170" stroke="#1D3557" strokeWidth="2" />
      {/* Faux text lines */}
      <line x1="55" y1="80" x2="105" y2="80" stroke="#1D3557" strokeWidth="1.5" opacity="0.4" />
      <line x1="55" y1="95" x2="100" y2="95" stroke="#1D3557" strokeWidth="1.5" opacity="0.4" />
      <line x1="55" y1="110" x2="105" y2="110" stroke="#1D3557" strokeWidth="1.5" opacity="0.4" />
      <line x1="55" y1="125" x2="90" y2="125" stroke="#1D3557" strokeWidth="1.5" opacity="0.4" />

      {/* Secret folded letter / bookmark */}
      <g transform="rotate(8 140 100)">
        <rect x="125" y="70" width="50" height="85" rx="3" fill="#E73847" stroke="#1D3557" strokeWidth="2" />
        <line x1="135" y1="85" x2="165" y2="85" stroke="#FFFFFF" strokeWidth="2" />
        <line x1="135" y1="95" x2="160" y2="95" stroke="#FFFFFF" strokeWidth="1.5" />
        <line x1="135" y1="105" x2="165" y2="105" stroke="#FFFFFF" strokeWidth="1.5" />
        {/* Tiny heart stamp / wax seal */}
        <circle cx="150" cy="130" r="5" fill="#A8DADB" stroke="#1D3557" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export function EmptyBookshelf({ className = "w-full max-w-xs h-auto" }) {
  return (
    <svg viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="An open shelf waiting for books">
      <rect x="20" y="140" width="200" height="12" rx="2" fill="#A8DADB" stroke="#1D3557" strokeWidth="2.5" />
      <line x1="30" y1="152" x2="30" y2="175" stroke="#1D3557" strokeWidth="3" />
      <line x1="210" y1="152" x2="210" y2="175" stroke="#1D3557" strokeWidth="3" />
      
      {/* Resting cup with warm tea */}
      <rect x="150" y="115" width="20" height="25" rx="3" fill="#E73847" stroke="#1D3557" strokeWidth="2" />
      <path d="M170 120C175 120 175 128 170 128" stroke="#1D3557" strokeWidth="2" />
      <path d="M156 105C156 100 162 98 160 92" stroke="#457B9D" strokeWidth="1.5" strokeLinecap="round" />

      {/* Single book leaning with quiet patience */}
      <g transform="rotate(-15 70 140)">
        <rect x="60" y="80" width="16" height="60" rx="2" fill="#457B9D" stroke="#1D3557" strokeWidth="2" />
        <line x1="64" y1="88" x2="64" y2="132" stroke="#FFFFFF" strokeWidth="1.5" />
      </g>

      {/* Little green plant trailing down */}
      <path d="M100 140C95 125 105 115 108 105" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      <path d="M104 118C99 116 98 122 104 118Z" fill="#A8DADB" stroke="#1D3557" strokeWidth="1.5" />
      <path d="M102 130C97 128 96 134 102 130Z" fill="#A8DADB" stroke="#1D3557" strokeWidth="1.5" />
      <circle cx="108" cy="103" r="2.5" fill="#E73847" />
    </svg>
  );
}

