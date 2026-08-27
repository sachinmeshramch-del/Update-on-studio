const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Bring back the brand icon & name for mobile, make it compact
const brandSectionOld = `<div className="hidden sm:block relative">
              <h1 className="text-base font-bold tracking-tight text-foreground leading-none">Gold Scalp AI</h1>
              <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase mt-1 block">XAUUSD</span>
            </div>`;

const brandSectionNew = `<div className="flex flex-col relative">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground leading-none">Gold Scalp AI</h1>
              <span className="text-[9px] sm:text-[11px] font-mono tracking-widest text-muted-foreground uppercase mt-1 block">XAUUSD</span>
            </div>`;

content = content.replace(brandSectionOld, brandSectionNew);

// 2. Reduce the Bid/Ask block size on mobile
content = content.replace(/min-w-\[110px\]/g, 'min-[400px]:min-w-[110px] min-w-[80px]'); // Replace both BID and ASK min-w
content = content.replace(/px-4 py-2/g, 'px-2 sm:px-4 py-1 sm:py-2'); // Reduce padding
content = content.replace(/text-xl/g, 'text-lg sm:text-xl'); // Int part
content = content.replace(/text-2xl/g, 'text-xl sm:text-2xl'); // Dec part
content = content.replace(/text-\[9px\]/g, 'text-[8px] sm:text-[9px]'); // Labels

// 3. Make the main header flex container better for mobile (allow shrink)
content = content.replace(
  'className="container mx-auto px-3 sm:px-4 h-[72px] flex items-center justify-between gap-3 sm:gap-4 overflow-x-auto hide-scrollbar"',
  'className="container mx-auto px-2 sm:px-4 h-[60px] sm:h-[72px] flex items-center justify-between gap-2 sm:gap-4 overflow-x-auto hide-scrollbar"'
);

// 4. Update the icon size
content = content.replace(
  'className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20"',
  'className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0"'
);
content = content.replace(
  'className="text-black w-5 h-5"',
  'className="text-black w-4 h-4 sm:w-5 sm:h-5"'
);

// 5. Change Stats formatting for mobile
// Change text-sm to text-xs sm:text-sm
content = content.replace(
  '"flex items-center gap-1 text-sm font-bold font-mono tabular-nums"',
  '"flex items-center gap-1 text-xs sm:text-sm font-bold font-mono tabular-nums flex-wrap justify-end"'
);

fs.writeFileSync(file, content);
console.log("Patched header again for mobile");
