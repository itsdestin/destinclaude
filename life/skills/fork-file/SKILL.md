---
name: fork-file
description: >
  Fork File — a food tracker. Manages grocery/pantry inventory across user-configured
  storage locations AND tracks fast food spending by restaurant, item, and size. Use when
  the user mentions groceries, pantry, fridge, freezer, fast food, restaurants, what they
  have on hand, what they bought, food spending, or asks about specific food items. Handles
  receipt processing via text messages, food photo identification, manual entry, inventory
  queries, age/freshness tracking, and spending summaries across groceries and fast food.
---
<!-- SPEC: Read specs/fork-file-spec.md before modifying this file -->
<!-- Original contribution by @tjmorin03 (https://github.com/tjmorin03) -->

# Fork File

You are managing the user's food tracking system. It has two components:

| Component | File | Purpose |
|---|---|---|
| Grocery inventory | `~/.claude/fork-file/pantry.csv` | What's in the pantry/fridge/freezer |
| Fast food log | `~/.claude/fork-file/fastfood.csv` | Fast food visits, items, and spending |

---

## First-Run Setup

Before any operation, check whether the data directory and CSV files exist. If they don't, bootstrap them:

1. Create the directory: `mkdir -p ~/.claude/fork-file`
2. Create `pantry.csv` with the header row: `item,category,location,quantity,price,date_added,expiration,notes`
3. Create `fastfood.csv` with the header row: `date,restaurant,item,size,price,notes`

If either CSV file exists but is empty (0 bytes), write the appropriate header row.

### Location Setup

If `~/.claude/fork-file/locations.txt` does not exist, ask the user to define their storage locations before proceeding with any grocery operation:

```
Before we start tracking groceries, I need to know your storage locations.

Common setups:
  - Simple: pantry, fridge, freezer
  - Two kitchens: kitchen_pantry, kitchen_fridge, bedroom_fridge
  - Roommate split: my_fridge, shared_pantry, garage_freezer

List your locations (comma-separated), or say "simple" for the default (pantry, fridge, freezer):
```

Save the locations one per line to `~/.claude/fork-file/locations.txt`. The default "simple" set is:
```
pantry
fridge
freezer
```

When displaying locations to the user, format them in Title Case with underscores replaced by spaces (e.g., `garage_freezer` → "Garage Freezer").

---

## Grocery Inventory

**File:** `~/.claude/fork-file/pantry.csv`

**CSV columns:** `item,category,location,quantity,price,date_added,expiration,notes`

`price` is the per-item price in dollars as a decimal (e.g., `3.99`). Leave blank if unknown.

**Valid locations:** Read from `~/.claude/fork-file/locations.txt`. If the user mentions a location not in the file, ask if they want to add it.

**Valid categories (use exactly as written):**
- `produce` — fresh fruits and vegetables
- `dairy` — milk, eggs, cheese, yogurt, butter
- `protein` — fresh/raw meat, fish, tofu
- `frozen` — anything stored in the freezer
- `canned` — canned and jarred goods
- `condiments` — sauces, dressings, oils, vinegars, hot sauce, mustard, ketchup
- `dry_goods` — pasta, rice, grains, flour, cereal, oats, bread
- `snacks` — chips, crackers, nuts, granola bars, candy
- `beverages` — drinks, juice, soda, sparkling water, coffee, tea
- `other` — anything that doesn't fit above

**Shelf life guidelines (days from date_added):**
- produce: 10
- dairy: 12
- protein: 4
- frozen: 120
- canned: 730
- condiments: 270
- dry_goods: 270
- snacks: 120
- beverages: 60
- other: 30

---

## Fast Food Log

**File:** `~/.claude/fork-file/fastfood.csv`

**CSV columns:** `date,restaurant,item,size,price,notes`

- `date` — `YYYY-MM-DD` always
- `restaurant` — name of the restaurant (e.g., `McDonald's`, `Chipotle`)
- `item` — individual menu item (e.g., `Big Mac`, `large fries`)
- `size` — size if applicable (e.g., `large`, `medium`, `small`, `regular`). Leave blank if not applicable.
- `price` — price of that individual item in dollars (e.g., `4.99`). Leave blank if unknown.
- `notes` — optional (e.g., `used app deal`, `drive-thru`)

Each row is one item. Multiple rows share the same `date` + `restaurant` to form a visit. Visit total is calculated by summing prices for matching `date` + `restaurant`.

---

## Receipt Photo via Text Messages

This skill can process receipt photos sent to the user's own messaging thread. Two messaging MCP servers are available — use whichever one the user has configured:

| Server | Platform | Conversation tool | Messages tool |
|---|---|---|---|
| `imessages` | macOS only | `mcp__imessages__imessages_conversations` | `mcp__imessages__imessages_messages` |
| `gmessages` | All platforms | `mcp__gmessages__gmessages_conversations` | `mcp__gmessages__gmessages_messages` |

**Detection:** Try calling the conversation-list tool for each server. Use whichever one responds successfully. If neither is available, tell the user: "No messaging server is configured. You can add items manually, or set up the `imessages` or `gmessages` MCP server to process receipt photos."

Once a working server is identified, cache the choice for the rest of the session — don't re-detect on every operation.

---

## Operations

### 1. Process Grocery Receipt from Messages

**Trigger:** "process my latest receipt", "I texted my grocery receipt", "receipt is in my messages"

1. Use the detected messaging server (see above) to identify the user's self-thread, then find the most recent message with an image attachment.
2. Read the image with the Read tool.
3. Parse every grocery line item. Ignore taxes, totals, store name, and non-food items unless asked.
4. Auto-assign a category to each item.
5. Read the user's locations from `locations.txt`, then group items by likely storage location and present a confirmation table:

   ```
   Here's what I found on your receipt ($47.32 total). Please confirm or correct the locations:

   Fridge: milk ($3.99), eggs ($4.49), cheddar cheese ($5.29)
   Pantry: olive oil ($8.99), pasta ($1.79), canned tomatoes ($2.49)
   Freezer: chicken breasts ($12.99)

   Reply with corrections or say "looks good" to continue.
   ```

6. Once locations are settled, present the final review table (item, category, location, quantity, price, date) and wait for explicit approval before writing anything.
7. On approval, append all items to `pantry.csv` with today's date.
8. Confirm: "Added 12 items to your grocery inventory. Total: $47.32."

---

### 2. Process Fast Food Receipt from Messages

**Trigger:** "process my fast food receipt", "I texted a fast food receipt", "log my fast food"

1. Use the detected messaging server to identify the user's self-thread, then find the most recent message with an image attachment.
2. Read the image with the Read tool.
3. Parse every line item. Capture the restaurant name from the receipt header.
4. For each item, capture: item name, size (if shown), and price.
5. Present a review table:

   ```
   Fast food receipt — McDonald's (2026-03-18)

   Item              Size     Price
   ────────────────────────────────
   Big Mac           —        $5.99
   Large fries       large    $3.49
   Coke              medium   $1.99
   ────────────────────────────────
   Visit total:              $11.47

   Say "looks good" to save, or make corrections.
   ```

6. Wait for explicit approval, then append to `fastfood.csv`. Each item gets its own row with the same date and restaurant.
7. Confirm: "Logged 3 items from McDonald's. Visit total: $11.47."

---

### 3. Add Grocery Items Manually

**Trigger:** "I bought...", "add to pantry...", "I got...", "add [item] to..."

1. Extract all items the user mentioned.
2. Read locations from `locations.txt`. For any item without a specified location, group by likely location and ask for confirmation.
3. Auto-assign categories.
4. After confirming locations, check each item for missing price and quantity. Ask in a single follow-up:
   ```
   A few more details before I save:

   - Milk: price? quantity?
   - Pasta: price? (quantity looks like 1 box — correct?)

   Reply like: "milk $3.99 / 1 gallon, pasta $1.79" or say "skip" to leave blank.
   ```
5. Apply any provided values. Leave blank anything skipped.
6. Present the final review table and wait for explicit approval.
7. On approval, append to `pantry.csv`.
8. Confirm what was added.

---

### 4. Add Fast Food Manually

**Trigger:** "I had fast food", "I ate at...", "log [restaurant]", "I got [item] from..."

1. Ask for any missing details in a single message:
   ```
   Got it — let me fill in the details:

   - Restaurant: [if not provided]
   - What did you order? (list items and sizes)
   - Prices? (say "skip" to leave blank)
   - Date? (default: today)
   ```
2. Build a review table with all items, sizes, prices, and visit total.
3. Wait for explicit approval before writing.
4. Append to `fastfood.csv`.
5. Confirm: "Logged [n] items from [restaurant]. Visit total: $X.XX."

---

### 5. Process Food Photo from Messages

**Trigger:** "process my latest food photo", "I texted a photo of my groceries", "identify what's in my photo"

1. Use the detected messaging server to find the most recent image in the user's self-thread.
2. Read the image. Identify every distinct food item — be specific about brand, variety, and approximate quantity if countable. Flag anything ambiguous.
3. Present identified items with suggested categories and ask for locations:

   ```
   Here's what I found in your photo:

   - Whole milk (1 carton) → dairy
   - Eggs (1 dozen) → dairy
   - Roma tomatoes (approx. 6) → produce
   - Something in a red box — looked like pasta?

   Where should these go?
   ```

4. Ask for prices in a single follow-up (photo won't have them).
5. Present final review table and wait for approval.
6. Append to `pantry.csv`.

---

### 6. Remove Grocery Items

**Trigger:** "I used...", "I finished...", "I'm out of...", "remove...", "used the last of..."

1. Read `pantry.csv` fresh.
2. Find matching rows (case-insensitive, partial match OK).
3. If multiple matches across locations, ask which to remove:
   ```
   I found eggs in two places:
     1. fridge (added 2026-03-10)
     2. garage_freezer (added 2026-03-15)
   Which should I remove? (or "both")
   ```
4. Remove selected rows and rewrite the file.
5. Confirm what was removed.

---

### 7. Query Grocery Inventory

**Trigger:** "what's in my [location]?", "do I have [item]?", "what do I have?", "show me my pantry"

**By location:** List all items grouped by category with quantity and age.

**By item:** Show item, location, quantity, date added, and age. If not found, say so.

**Full inventory:** Show all locations as sections grouped by category.

Format ages as: `3d`, `2w`, `1m`.

---

### 8. What's Getting Old

**Trigger:** "what's getting old?", "what should I use soon?", "anything expiring?"

1. Read `pantry.csv`.
2. Calculate age from `date_added` to today. Use `expiration` if set.
3. Flag:
   - `[OVERDUE]` — past shelf life or expiration date
   - `[USE SOON]` — within 25% of shelf life remaining
4. Present prioritized list, most urgent first. If nothing flagged, say so.

---

### 9. Spending Summary

**Trigger:** "how much did I spend?", "spending breakdown", "what's my most expensive category?", "how much have I spent on food?", "fast food spending", "how much is my pantry worth?"

**Always ask first:**
```
Which spending would you like to see?
  1. Groceries only
  2. Fast food only
  3. Both (combined total)
```

**Groceries:** Sum `price` from `pantry.csv`, grouped however asked (last run, this month, by category, total, current inventory value).

**Fast food:** Sum `price` from `fastfood.csv`. Break down by restaurant, item, time period, or total. Visit totals calculated by grouping `date` + `restaurant`.

**Combined:** Show groceries and fast food as separate subtotals, then a grand total.

Always note how many items had no price data and were excluded.

Format:
```
Groceries — last run (2026-03-18): $74.21
Fast food — this month: $38.50
─────────────────────────────────────────
Total food spending: $112.71
```

---

## General Rules

- **NEVER write to any file without explicit user approval.** Always present a complete review table and wait for "looks good", "save", "yes", or similar. If corrections are made, update and show the table again.
- The review table must show all columns that will be written.
- Always read the relevant CSV(s) fresh before any operation — never work from memory.
- Never overwrite a CSV without reading it first.
- When writing, preserve all existing rows unless explicitly removing something.
- Date format: `YYYY-MM-DD` always.
- If a CSV is empty (only the header row), say so and offer to add items.
- After any add/remove operation, confirm with a brief summary of what changed.
- For ambiguous food queries (e.g., "do I have chicken?"), check all locations and report all matches.

## Dependencies

This skill requires:
- **DestinClaude core layer** — for hooks and specs system
- **Messaging MCP server (optional)** — `imessages` (macOS) or `gmessages` (all platforms) for receipt/photo processing via text messages. Without a messaging server, only manual entry operations (3, 4, 6–9) are available.
