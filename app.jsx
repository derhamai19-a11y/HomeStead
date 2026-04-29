// =============================================================================
// HOMESTEAD - A shared garden chore app for George & Sammy
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  initializeApp,
} from 'firebase/app';
import {
  getDatabase,
  ref as dbRef,
  set as dbSet,
  onValue,
  serverTimestamp,
} from 'firebase/database';

// Config is set globally in index.html so users can edit one file
// without re-bundling. See: window.HOMESTEAD_CONFIG block in index.html.
const _cfg = (typeof window !== 'undefined' && window.HOMESTEAD_CONFIG) || {};
const firebaseConfig = _cfg.firebase || {};
const householdId = _cfg.householdId || 'homestead-default';

// Check the user actually filled in the config before trying to boot Firebase
const _configMissing = !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes('REPLACE_ME') ||
  !firebaseConfig.databaseURL ||
  firebaseConfig.databaseURL.includes('REPLACE_ME') ||
  householdId.includes('CHANGE-ME');

if (_configMissing) {
  // Render a friendly setup-needed screen and stop.
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = `
          <div style="max-width:520px;margin:48px auto;padding:24px;font-family:Quicksand,sans-serif;color:#3D2A1F;background:#FFFAEF;border:1px solid rgba(60,40,20,0.14);border-radius:16px;box-shadow:0 4px 14px rgba(60,40,20,0.10);">
            <h1 style="font-family:'Cormorant Garamond',serif;font-size:32px;margin:0 0 8px;">Almost there 🌱</h1>
            <p style="font-size:15px;line-height:1.55;margin:8px 0;">Homestead needs a Firebase config and a household ID before it can boot.</p>
            <p style="font-size:14px;line-height:1.55;margin:8px 0;">Open <code style="background:#F4ECD9;padding:2px 6px;border-radius:4px;">index.html</code> in a text editor and replace the <code style="background:#F4ECD9;padding:2px 6px;border-radius:4px;">REPLACE_ME</code> values with your Firebase project details. Step-by-step instructions are in the README.</p>
            <p style="font-size:13px;color:#8A7560;margin-top:16px;font-style:italic;">Once saved, refresh this page.</p>
          </div>
        `;
      }
    });
  }
  // Stop the rest of the bundle from running so we don't crash.
  throw new Error('Homestead config not set — edit index.html');
}

// =============================================================================
// FIREBASE INIT
// =============================================================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// =============================================================================
// CONSTANTS
// =============================================================================

const ZONES = {
  'herb-garden':   { name: 'Herb Garden',  room: 'Kitchen' },
  'lawn':          { name: 'The Lawn',     room: 'Lawn' },
  'mower':         { name: 'Lawnmower',    room: 'Car' },
  'hedge':         { name: 'The Hedge',    room: 'Hedge' },
  'patio':         { name: 'The Patio',    room: 'Patio' },
  'playhouse':     { name: 'Playhouse',    room: "Vinnie's Room" },
  'outhouse':      { name: 'Outhouse',     room: 'Bathroom' },
  'sun-lounger':   { name: 'Sun Lounger',  room: 'Bedroom' },
  'greenhouse':    { name: 'Greenhouse',   room: 'Living Room' },
  'pumpkin-patch': { name: 'Pumpkin Patch',room: 'Veg Patch' },
  'rodney':        { name: 'Rodney',       room: 'Rodney' },
  'forrest':       { name: 'Forrest',      room: 'Forrest' },
};

const PRESET_JOBS = [
  // Kitchen / Herb Garden
  { id: 'wipe-counters', name: 'Wipe kitchen counters', emoji: '✨', zone: 'herb-garden', type: 'recurring', timeScore: 1, unpleasantnessScore: 1, frequencyDays: 1 },
  { id: 'mop-kitchen', name: 'Mop kitchen floor', emoji: '🧹', zone: 'herb-garden', type: 'recurring', timeScore: 2, unpleasantnessScore: 2, frequencyDays: 7 },
  { id: 'clean-oven', name: 'Clean the oven', emoji: '🔥', zone: 'herb-garden', type: 'recurring', timeScore: 4, unpleasantnessScore: 5, frequencyDays: 30 },
  { id: 'clean-fridge', name: 'Clean out fridge', emoji: '🧊', zone: 'herb-garden', type: 'recurring', timeScore: 3, unpleasantnessScore: 3, frequencyDays: 30 },
  { id: 'kitchen-bin', name: 'Take out kitchen bin', emoji: '🗑️', zone: 'herb-garden', type: 'recurring', timeScore: 1, unpleasantnessScore: 2, frequencyDays: 3 },
  { id: 'dishwasher', name: 'Load/unload dishwasher', emoji: '🍽️', zone: 'herb-garden', type: 'tappable', timeScore: 1, unpleasantnessScore: 1 },

  // Lawn
  { id: 'mow-lawn', name: 'Mow the lawn', emoji: '🌿', zone: 'lawn', type: 'recurring', timeScore: 4, unpleasantnessScore: 2, frequencyDays: 10 },
  { id: 'edge-lawn', name: 'Edge the lawn', emoji: '✂️', zone: 'lawn', type: 'recurring', timeScore: 3, unpleasantnessScore: 2, frequencyDays: 21 },

  // Car / Mower
  { id: 'wash-car', name: 'Wash the car', emoji: '🚗', zone: 'mower', type: 'recurring', timeScore: 3, unpleasantnessScore: 2, frequencyDays: 21 },
  { id: 'hoover-car', name: 'Hoover the car', emoji: '🧹', zone: 'mower', type: 'recurring', timeScore: 2, unpleasantnessScore: 2, frequencyDays: 30 },

  // Hedge
  { id: 'trim-hedge', name: 'Trim the hedge', emoji: '🪴', zone: 'hedge', type: 'recurring', timeScore: 5, unpleasantnessScore: 3, frequencyDays: 60 },

  // Patio
  { id: 'sweep-patio', name: 'Sweep the patio', emoji: '🍃', zone: 'patio', type: 'recurring', timeScore: 2, unpleasantnessScore: 1, frequencyDays: 7 },
  { id: 'pressure-wash', name: 'Pressure wash patio', emoji: '💦', zone: 'patio', type: 'annual', timeScore: 5, unpleasantnessScore: 3 },

  // Playhouse / Vinnie's Room
  { id: 'tidy-vinnie', name: "Tidy Vinnie's toys", emoji: '🧸', zone: 'playhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 1, frequencyDays: 2 },
  { id: 'hoover-vinnie', name: "Hoover Vinnie's room", emoji: '🧹', zone: 'playhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 1, frequencyDays: 7 },
  { id: 'change-vinnie-bed', name: "Change Vinnie's bedding", emoji: '🛏️', zone: 'playhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 2, frequencyDays: 7 },

  // Outhouse / Bathroom
  { id: 'clean-toilet', name: 'Clean the toilet', emoji: '🚽', zone: 'outhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 5, frequencyDays: 4 },
  { id: 'clean-shower', name: 'Clean the shower', emoji: '🚿', zone: 'outhouse', type: 'recurring', timeScore: 3, unpleasantnessScore: 4, frequencyDays: 7 },
  { id: 'mop-bathroom', name: 'Mop bathroom floor', emoji: '🧽', zone: 'outhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 3, frequencyDays: 7 },

  // Sun Lounger / Bedroom
  { id: 'make-bed', name: 'Make the bed', emoji: '🛏️', zone: 'sun-lounger', type: 'recurring', timeScore: 1, unpleasantnessScore: 1, frequencyDays: 1 },
  { id: 'change-sheets', name: 'Change bed sheets', emoji: '🛌', zone: 'sun-lounger', type: 'recurring', timeScore: 2, unpleasantnessScore: 2, frequencyDays: 14 },
  { id: 'hoover-bedroom', name: 'Hoover the bedroom', emoji: '🧹', zone: 'sun-lounger', type: 'recurring', timeScore: 2, unpleasantnessScore: 1, frequencyDays: 7 },

  // Greenhouse / Living Room
  { id: 'hoover-living', name: 'Hoover living room', emoji: '🧹', zone: 'greenhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 1, frequencyDays: 3 },
  { id: 'dust-living', name: 'Dust living room', emoji: '🪶', zone: 'greenhouse', type: 'recurring', timeScore: 2, unpleasantnessScore: 1, frequencyDays: 7 },
  { id: 'tidy-living', name: 'Tidy living room', emoji: '🧺', zone: 'greenhouse', type: 'recurring', timeScore: 1, unpleasantnessScore: 1, frequencyDays: 1 },

  // Pumpkin Patch / Veg Patch
  { id: 'water-veg', name: 'Water the veg patch', emoji: '💧', zone: 'pumpkin-patch', type: 'recurring', timeScore: 1, unpleasantnessScore: 1, frequencyDays: 2 },
  { id: 'weed-veg', name: 'Weed the veg patch', emoji: '🌾', zone: 'pumpkin-patch', type: 'recurring', timeScore: 3, unpleasantnessScore: 2, frequencyDays: 14 },

  // Rodney
  { id: 'walk-rodney', name: 'Walk Rodney', emoji: '🦮', zone: 'rodney', type: 'tappable', timeScore: 3, unpleasantnessScore: 1 },
  { id: 'feed-rodney', name: 'Feed Rodney', emoji: '🍖', zone: 'rodney', type: 'tappable', timeScore: 1, unpleasantnessScore: 1 },
  { id: 'bathe-rodney', name: 'Bathe Rodney', emoji: '🛁', zone: 'rodney', type: 'recurring', timeScore: 3, unpleasantnessScore: 4, frequencyDays: 30 },
  { id: 'pickup-poo', name: 'Pick up dog poo', emoji: '💩', zone: 'rodney', type: 'recurring', timeScore: 1, unpleasantnessScore: 5, frequencyDays: 2 },

  // Forrest
  { id: 'feed-forrest', name: 'Feed Forrest', emoji: '🐟', zone: 'forrest', type: 'tappable', timeScore: 1, unpleasantnessScore: 1 },
  { id: 'litter-tray', name: 'Empty the litter tray', emoji: '🧻', zone: 'forrest', type: 'recurring', timeScore: 1, unpleasantnessScore: 5, frequencyDays: 2 },
  { id: 'brush-forrest', name: 'Brush Forrest', emoji: '🪥', zone: 'forrest', type: 'recurring', timeScore: 1, unpleasantnessScore: 1, frequencyDays: 7 },
  { id: 'flea-treatment', name: 'Flea & worm treatment', emoji: '💊', zone: 'forrest', type: 'recurring', timeScore: 1, unpleasantnessScore: 3, frequencyDays: 30 },

  // General
  { id: 'laundry-load', name: 'Run a load of washing', emoji: '👕', zone: 'sun-lounger', type: 'tappable', timeScore: 1, unpleasantnessScore: 1 },
  { id: 'hang-washing', name: 'Hang out washing', emoji: '🧺', zone: 'sun-lounger', type: 'tappable', timeScore: 1, unpleasantnessScore: 1 },
  { id: 'fold-washing', name: 'Fold and put away laundry', emoji: '🧦', zone: 'sun-lounger', type: 'tappable', timeScore: 2, unpleasantnessScore: 2 },
  { id: 'main-bins', name: 'Take out the main bins', emoji: '🗑️', zone: 'patio', type: 'recurring', timeScore: 1, unpleasantnessScore: 2, frequencyDays: 7 },
  { id: 'food-shop', name: 'Do the food shop', emoji: '🛒', zone: 'herb-garden', type: 'tappable', timeScore: 4, unpleasantnessScore: 2 },
];

// Rewards have a "kind":
//   - "paid": costs £ from the monthly pot
//   - "free": costs nothing, but locked behind a lifetime-seed threshold (unlockAt)
const PRESET_SHOP = [
  // ── Free rewards (unlock at lifetime-seed thresholds) ──────────────────────
  { id: 'lie-in',         name: 'A morning lie-in',         emoji: '😴', kind: 'free', unlockAt: 0,    description: 'The other parent does the morning shift' },
  { id: 'spa-hour',       name: 'An hour to yourself',      emoji: '🛀', kind: 'free', unlockAt: 0,    description: 'A long bath, a book, total peace' },
  { id: 'skip-chore',     name: 'Get-out-of-jail card',     emoji: '🎫', kind: 'free', unlockAt: 250,  description: 'Skip one chore guilt-free' },
  { id: 'choose-dinner',  name: 'Pick tonight\'s dinner',   emoji: '🍽️', kind: 'free', unlockAt: 500,  description: 'Whatever you fancy — your call' },
  { id: 'control-music',  name: 'DJ for the day',           emoji: '🎧', kind: 'free', unlockAt: 1000, description: 'Your playlist runs the house today' },
  { id: 'breakfast-bed',  name: 'Breakfast in bed',         emoji: '🍳', kind: 'free', unlockAt: 2000, description: 'The other parent serves breakfast in bed' },
  // ── Paid rewards (come out of monthly £ pot) ───────────────────────────────
  { id: 'movie-night',    name: 'Movie night (you pick)',   emoji: '🎬', kind: 'paid', value: 5,  description: 'Whoever cashes this in chooses the film' },
  { id: 'new-plant',      name: 'A new plant for the garden', emoji: '🌷', kind: 'paid', value: 15, description: 'A real plant for your real garden', joint: true },
  { id: 'takeaway',       name: 'Takeaway night',           emoji: '🍕', kind: 'paid', value: 30, description: 'No cooking — order in something nice' },
  { id: 'pub-lunch',      name: 'Pub lunch',                emoji: '🍻', kind: 'paid', value: 35, description: 'A leisurely pub lunch out', joint: true },
  { id: 'date-night',     name: 'Date night out',           emoji: '🍷', kind: 'paid', value: 80, description: 'Babysitter, dinner, the works', joint: true },
];

const LEVELS = [
  { level: 1, threshold: 0,    name: 'Bare Patch',    description: 'Just a patch of earth and dreams' },
  { level: 2, threshold: 300,  name: 'First Sprouts', description: 'Tiny green shoots breaking through' },
  { level: 3, threshold: 800,  name: 'Cottage Garden',description: 'Taking shape, full of promise' },
  { level: 4, threshold: 1800, name: 'Country Garden',description: 'Established and beautiful' },
  { level: 5, threshold: 3500, name: 'Show Garden',   description: 'Magazine-worthy. A glass of wine on the patio.' },
  { level: 6, threshold: 6000, name: 'Eden',          description: 'A masterpiece. Welcome to paradise.' },
];

const SEASONS = [
  { name: 'Winter',      emoji: '❄️', minStreak: 0 },
  { name: 'Early Spring',emoji: '🌱', minStreak: 3 },
  { name: 'Spring',      emoji: '🌸', minStreak: 7 },
  { name: 'Summer',      emoji: '☀️', minStreak: 14 },
  { name: 'High Summer', emoji: '🌻', minStreak: 30 },
];

// =============================================================================
// HELPERS
// =============================================================================

const todayISO = () => new Date().toISOString().split('T')[0];
const nowISO = () => new Date().toISOString();
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const daysBetween = (dateA, dateB) => {
  // Strip time component — "completed at 10am" vs "today's date string" both become midnight
  const toMidnight = d => new Date(String(d || '').split('T')[0]);
  return Math.floor((toMidnight(dateB) - toMidnight(dateA)) / (1000 * 60 * 60 * 24));
};

const calcBasePoints = (job) => (job.timeScore + job.unpleasantnessScore) * 5;

const getJobUrgency = (job, holidayMode = false) => {
  if (job.type === 'tappable') return 'tappable';
  if (job.urgencyOverride === 'paused' || holidayMode) return 'paused';
  if (job.type === 'oneoff' || job.type === 'annual') {
    if (!job.dueDate) return 'routine';
    const days = daysBetween(todayISO(), job.dueDate);
    if (days > 7) return 'routine';
    if (days > 0) return 'due-soon';
    if (days > -3) return 'overdue';
    return 'neglected';
  }
  if (!job.lastCompleted) return 'overdue';
  const daysSince = daysBetween(job.lastCompleted, todayISO());
  const ratio = daysSince / job.frequencyDays;
  if (ratio < 0.7) return 'routine';
  if (ratio < 1.0) return 'due-soon';
  if (ratio < 1.5) return 'overdue';
  return 'neglected';
};

const URGENCY_META = {
  'tappable':  { label: 'Anytime',     bg: 'bg-sky-100',     text: 'text-sky-700',     mult: 1,   health: 4 },
  'paused':    { label: 'Paused',      bg: 'bg-stone-100',   text: 'text-stone-500',   mult: 1,   health: 4 },
  'routine':   { label: 'Thriving',    bg: 'bg-emerald-100', text: 'text-emerald-700', mult: 1,   health: 4 },
  'due-soon':  { label: 'Needs water', bg: 'bg-amber-100',   text: 'text-amber-700',   mult: 1.2, health: 3 },
  'overdue':   { label: 'Wilting',     bg: 'bg-orange-100',  text: 'text-orange-700',  mult: 1.5, health: 2 },
  'neglected': { label: 'Dying',       bg: 'bg-rose-100',    text: 'text-rose-700',    mult: 2,   health: 1 },
};

const calcJobPoints = (job, holidayMode, hotStreakActive) => {
  const u = getJobUrgency(job, holidayMode);
  const base = calcBasePoints(job);
  const urgencyMult = URGENCY_META[u].mult;
  const hotMult = hotStreakActive ? 1.25 : 1;
  return Math.round(base * urgencyMult * hotMult);
};

const getLevel = (points) => {
  let current = LEVELS[0];
  for (const l of LEVELS) if (points >= l.threshold) current = l;
  return current;
};

const getNextLevel = (points) => {
  for (const l of LEVELS) if (l.threshold > points) return l;
  return null;
};

const getSeason = (streak) => {
  let current = SEASONS[0];
  for (const s of SEASONS) if (streak >= s.minStreak) current = s;
  return current;
};

const getZoneHealth = (zone, jobs, holidayMode) => {
  const zoneJobs = jobs.filter(j => j.zone === zone && !j.deleted);
  if (zoneJobs.length === 0) return 4;
  return Math.min(...zoneJobs.map(j => URGENCY_META[getJobUrgency(j, holidayMode)].health));
};

const weekStartISO = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
};

// =============================================================================
// FIREBASE STORAGE LAYER
// =============================================================================

const PATHS = {
  state:   `households/${householdId}/state`,
  jobs:    `households/${householdId}/jobs`,
  journal: `households/${householdId}/journal`,
  shop:    `households/${householdId}/shop`,
};

const saveToFB = (path, value) => dbSet(dbRef(db, path), value);
const loadFB = (path) => new Promise((resolve) => {
  onValue(dbRef(db, path), (snap) => resolve(snap.val()), { onlyOnce: true });
});

const subscribeFB = (path, callback) => {
  const unsub = onValue(dbRef(db, path), (snap) => callback(snap.val()));
  return unsub;
};

const defaultState = () => ({
  individualPoints: { George: 0, Sammy: 0 },
  individualLifetime: { George: 0, Sammy: 0 },
  weeklyTargets: { George: 200, Sammy: 200 },
  weekStart: weekStartISO(),
  weeklyProgress: { George: 0, Sammy: 0 },
  streakDays: 0,
  lastStreakDate: null,
  contributorsToday: [],
  holidayMode: false,
  totalCompleted: 0,
  // Hot streak (within-day momentum)
  hotStreakDate: null,
  hotStreakCount: { George: 0, Sammy: 0 },
  // Monthly budget
  monthlyBudget: 100,        // £
  monthlyTarget: 2000,       // seeds
  thresholdPct: 70,          // % of seed target needed to unlock full budget
  monthKey: monthKey(),
  monthSeeds: 0,             // total seeds earned this calendar month
  monthBalanceCarry: 0,      // £ carried over from previous month
  monthSpent: 0,             // £ spent this month
});

// =============================================================================
// MONTHLY BUDGET CALCULATIONS
// =============================================================================

const calcMonthlyAvailable = (state) => {
  const earnedFraction = Math.min(1, state.monthSeeds / state.monthlyTarget);
  const thresholdFrac = state.thresholdPct / 100;
  // If we hit the threshold, full budget is unlocked. Otherwise proportional.
  const unlocked = earnedFraction >= thresholdFrac
    ? state.monthlyBudget
    : (earnedFraction / thresholdFrac) * state.monthlyBudget;
  const total = unlocked + (state.monthBalanceCarry || 0);
  return Math.max(0, total - (state.monthSpent || 0));
};

const calcMonthlyUnlocked = (state) => {
  const earnedFraction = Math.min(1, state.monthSeeds / state.monthlyTarget);
  const thresholdFrac = state.thresholdPct / 100;
  return earnedFraction >= thresholdFrac
    ? state.monthlyBudget
    : (earnedFraction / thresholdFrac) * state.monthlyBudget;
};

const calcSeedCost = (rewardValue, state) => {
  // £ value -> seed cost based on monthly budget/target
  // (value / budget) * target = seeds needed
  if (!rewardValue || rewardValue <= 0) return 0;
  return Math.round((rewardValue / state.monthlyBudget) * state.monthlyTarget);
};

// =============================================================================
// MAIN APP
// =============================================================================

function Homestead() {
  const [user, setUser] = useState(() => localStorage.getItem('homestead-user'));
  const [view, setView] = useState('garden');
  const [state, setState] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [journal, setJournal] = useState([]);
  const [shop, setShop] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAddShopItem, setShowAddShopItem] = useState(false);
  const [editShopItem, setEditShopItem] = useState(null);
  const [highFiveAnimation, setHighFiveAnimation] = useState(null);

  // -------------------------------------------------------------------------
  // FIREBASE SUBSCRIPTIONS - real-time sync
  // -------------------------------------------------------------------------

  useEffect(() => {
    let stateLoaded = false, jobsLoaded = false, journalLoaded = false, shopLoaded = false;
    const checkAllLoaded = () => {
      if (stateLoaded && jobsLoaded && journalLoaded && shopLoaded) setLoading(false);
    };

    // Subscribe to state
    const unsubState = subscribeFB(PATHS.state, async (val) => {
      if (!val) {
        // First run: seed the database with defaults
        const ds = defaultState();
        await saveToFB(PATHS.state, ds);
        setState(ds);
        setShowWelcome(true);
      } else {
        // Reset weekly progress if new week
        let updated = val;
        if (val.weekStart !== weekStartISO()) {
          updated = { ...val, weekStart: weekStartISO(), weeklyProgress: { George: 0, Sammy: 0 } };
          await saveToFB(PATHS.state, updated);
        }
        // Reset hot streak if new day
        if (val.hotStreakDate !== todayISO()) {
          updated = { ...updated, hotStreakDate: todayISO(), hotStreakCount: { George: 0, Sammy: 0 } };
          await saveToFB(PATHS.state, updated);
        }
        // Monthly rollover
        const currentMonth = monthKey();
        if (val.monthKey !== currentMonth) {
          // Roll unspent budget into the carry
          const previousAvailable = calcMonthlyAvailable(val);
          updated = {
            ...updated,
            monthKey: currentMonth,
            monthSeeds: 0,
            monthSpent: 0,
            monthBalanceCarry: Math.round(previousAvailable * 100) / 100,
          };
          await saveToFB(PATHS.state, updated);
        }
        setState(updated);
      }
      stateLoaded = true; checkAllLoaded();
    });

    // Subscribe to jobs
    const unsubJobs = subscribeFB(PATHS.jobs, async (val) => {
      if (!val) {
        const today = nowISO();
        const seeded = PRESET_JOBS.map(p => ({
          ...p,
          lastCompleted: p.type === 'recurring' ? today : null,
          lastCompletedBy: null,
          urgencyOverride: null,
          deleted: false,
          assignedTo: 'either', // 'George', 'Sammy', or 'either'
        }));
        const obj = Object.fromEntries(seeded.map(j => [j.id, j]));
        await saveToFB(PATHS.jobs, obj);
        setJobs(seeded);
      } else {
        setJobs(Object.values(val));
      }
      jobsLoaded = true; checkAllLoaded();
    });

    // Subscribe to journal
    const unsubJournal = subscribeFB(PATHS.journal, (val) => {
      if (!val) {
        setJournal([]);
      } else {
        const entries = Object.values(val).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        setJournal(entries.slice(0, 200));
      }
      journalLoaded = true; checkAllLoaded();
    });

    // Subscribe to shop
    const unsubShop = subscribeFB(PATHS.shop, async (val) => {
      if (!val) {
        const obj = Object.fromEntries(PRESET_SHOP.map(s => [s.id, s]));
        await saveToFB(PATHS.shop, obj);
        setShop(PRESET_SHOP);
      } else {
        setShop(Object.values(val));
      }
      shopLoaded = true; checkAllLoaded();
    });

    return () => {
      unsubState();
      unsubJobs();
      unsubJournal();
      unsubShop();
    };
  }, []);

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  const showToast = (msg, type = 'success', actionLabel, actionFn) => {
    setToast({ msg, type, actionLabel, actionFn });
    setTimeout(() => setToast(null), 5000);
  };

  const askConfirm = (message, onConfirm, danger = false) => {
    setConfirmDialog({ message, onConfirm, danger });
  };

  const partner = user === 'George' ? 'Sammy' : 'George';
  const totalLifetime = state ? (state.individualLifetime?.George || 0) + (state.individualLifetime?.Sammy || 0) : 0;
  const totalPoints = state ? (state.individualPoints?.George || 0) + (state.individualPoints?.Sammy || 0) : 0;
  const currentLevel = getLevel(totalLifetime);
  const nextLevel = getNextLevel(totalLifetime);
  const season = getSeason(state?.streakDays || 0);
  const monthlyAvailable = state ? calcMonthlyAvailable(state) : 0;
  const monthlyUnlocked = state ? calcMonthlyUnlocked(state) : 0;
  const hotStreakCount = state?.hotStreakCount?.[user] || 0;
  const hotStreakActive = hotStreakCount >= 3;

  // Celebration triggers
  const [prevLevel, setPrevLevel] = useState(null);
  const [prevTargetHit, setPrevTargetHit] = useState(false);
  const [prevHotStreakActive, setPrevHotStreakActive] = useState(false);
  useEffect(() => {
    if (!state) return;
    if (prevLevel !== null && currentLevel.level > prevLevel) {
      setCelebration({
        type: 'level',
        title: `Level ${currentLevel.level}!`,
        subtitle: currentLevel.name,
        description: currentLevel.description,
        emoji: ['🌱','🌿','🌷','🌳','🌻','✨'][currentLevel.level - 1] || '🎉',
      });
    }
    setPrevLevel(currentLevel.level);
  }, [currentLevel.level, state]);
  useEffect(() => {
    if (!state || !user) return;
    const target = state.weeklyTargets?.[user] || 200;
    const earned = state.weeklyProgress?.[user] || 0;
    const hitNow = earned >= target;
    if (hitNow && !prevTargetHit) {
      setCelebration({
        type: 'target',
        title: 'Weekly target hit!',
        subtitle: `${earned} seeds this week`,
        description: 'Brilliant work. Treat yourself.',
        emoji: '🎯',
      });
    }
    setPrevTargetHit(hitNow);
  }, [state?.weeklyProgress, user]);
  useEffect(() => {
    if (hotStreakActive && !prevHotStreakActive) {
      setCelebration({
        type: 'hotstreak',
        title: 'Hot Streak!',
        subtitle: '3 jobs in one day',
        description: 'You\'re on fire! +25% seeds on the next jobs today.',
        emoji: '🔥',
      });
    }
    setPrevHotStreakActive(hotStreakActive);
  }, [hotStreakActive]);

  // -------------------------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------------------------

  const completeJob = async (job) => {
    if (!state || !user) return;
    const points = calcJobPoints(job, state.holidayMode, hotStreakActive);
    const urgency = getJobUrgency(job, state.holidayMode);
    const today = todayISO();

    // Snapshot for undo
    const undoSnap = {
      state: JSON.parse(JSON.stringify(state)),
      jobs: JSON.parse(JSON.stringify(jobs)),
    };

    // Update state
    const newState = { ...state };
    newState.individualPoints = { ...newState.individualPoints, [user]: (newState.individualPoints[user] || 0) + points };
    newState.individualLifetime = { ...newState.individualLifetime, [user]: (newState.individualLifetime[user] || 0) + points };
    newState.weeklyProgress = { ...newState.weeklyProgress, [user]: (newState.weeklyProgress[user] || 0) + points };
    newState.totalCompleted = (newState.totalCompleted || 0) + 1;
    newState.monthSeeds = (newState.monthSeeds || 0) + points;

    // Hot streak
    if (newState.hotStreakDate !== today) {
      newState.hotStreakDate = today;
      newState.hotStreakCount = { George: 0, Sammy: 0 };
    } else {
      newState.hotStreakCount = { ...newState.hotStreakCount };
    }
    newState.hotStreakCount[user] = (newState.hotStreakCount[user] || 0) + 1;

    // Daily streak
    if (!newState.contributorsToday) newState.contributorsToday = [];
    if (!newState.contributorsToday.includes(user)) {
      newState.contributorsToday = [...newState.contributorsToday, user];
    }
    if (newState.lastStreakDate !== today && !newState.holidayMode) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (newState.lastStreakDate === yesterday) {
        newState.streakDays = (newState.streakDays || 0) + 1;
      } else if (newState.lastStreakDate !== today) {
        newState.streakDays = 1;
      }
      newState.lastStreakDate = today;
      newState.contributorsToday = [user];
    }

    // Update job
    const updatedJob = { ...job };
    if (updatedJob.type === 'oneoff') {
      updatedJob.deleted = true;
    } else if (updatedJob.type === 'annual') {
      updatedJob.lastCompleted = nowISO();
      updatedJob.lastCompletedBy = user;
      updatedJob.urgencyOverride = null;
      if (updatedJob.dueDate) {
        const d = new Date(updatedJob.dueDate);
        d.setFullYear(d.getFullYear() + 1);
        updatedJob.dueDate = d.toISOString().split('T')[0];
      }
    } else if (updatedJob.type === 'tappable') {
      // No state change needed
    } else {
      updatedJob.lastCompleted = nowISO();
      updatedJob.lastCompletedBy = user;
      updatedJob.urgencyOverride = null;
    }

    // Journal entry
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: nowISO(),
      user,
      jobId: job.id,
      jobName: job.name,
      jobEmoji: job.emoji,
      points,
      urgency,
      type: 'completed',
    };

    // Save
    await Promise.all([
      saveToFB(PATHS.state, newState),
      saveToFB(`${PATHS.jobs}/${job.id}`, updatedJob),
      saveToFB(`${PATHS.journal}/${entry.id}`, entry),
    ]);

    const msgs = {
      'tappable':  `+${points} seeds 🌱`,
      'routine':   `+${points} seeds — keeping the garden lovely`,
      'due-soon':  `+${points} seeds — well timed!`,
      'overdue':   `+${points} seeds — saved it from wilting`,
      'neglected': `+${points} seeds — RESCUE!`,
    };
    let msg = msgs[urgency] || `+${points} seeds`;
    if (hotStreakActive) msg += ' 🔥';
    showToast(msg, 'success', 'Undo', () => undoCompletion(undoSnap, entry.id));
  };

  const undoCompletion = async (snap, entryId) => {
    await Promise.all([
      saveToFB(PATHS.state, snap.state),
      saveToFB(PATHS.jobs, Object.fromEntries(snap.jobs.map(j => [j.id, j]))),
      saveToFB(`${PATHS.journal}/${entryId}`, null),
    ]);
    showToast('Undone 🔄');
  };

  const buyReward = (item) => {
    if (!state) return;
    const isFree = item.kind === 'free' || (!item.kind && (item.value || 0) === 0);
    const cost = isFree ? 0 : (item.value || 0);

    // Free rewards: gated by lifetime seed unlock threshold
    if (isFree) {
      const unlockAt = item.unlockAt || 0;
      if (totalLifetime < unlockAt) {
        showToast(`Locked — earn ${unlockAt - totalLifetime} more lifetime seeds 🔒`, 'error');
        return;
      }
    } else {
      if (cost > monthlyAvailable + 0.01) {
        showToast(`Not enough budget — need £${(cost - monthlyAvailable).toFixed(2)} more`, 'error');
        return;
      }
    }

    const confirmMsg = isFree
      ? `Redeem "${item.name}"? It's free — but only redeemable once per occurrence.`
      : `Spend £${cost} on "${item.name}"? Comes out of your monthly pot.`;

    askConfirm(confirmMsg, async () => {
      const newState = { ...state };
      if (!isFree) newState.monthSpent = (state.monthSpent || 0) + cost;
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: nowISO(),
        user,
        itemId: item.id,
        itemName: item.name,
        itemEmoji: item.emoji,
        itemValue: cost,
        itemKind: isFree ? 'free' : 'paid',
        joint: !!item.joint,
        type: 'purchase',
      };
      await Promise.all([
        saveToFB(PATHS.state, newState),
        saveToFB(`${PATHS.journal}/${entry.id}`, entry),
      ]);
      showToast(isFree ? `${item.emoji} ${item.name} — enjoy! 🎁` : `${item.emoji} Enjoy it! ${item.name}`);
    });
  };

  const addJob = async (newJob) => {
    const job = {
      ...newJob,
      id: `custom-${Date.now()}`,
      lastCompleted: newJob.type === 'recurring' ? nowISO() : null,
      lastCompletedBy: null,
      urgencyOverride: null,
      deleted: false,
      assignedTo: newJob.assignedTo || 'either',
    };
    await saveToFB(`${PATHS.jobs}/${job.id}`, job);
    showToast(`Added "${job.name}" 🌱`);
  };

  const updateJob = async (id, updates) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    await saveToFB(`${PATHS.jobs}/${id}`, { ...job, ...updates });
  };

  const deleteJob = (id) => {
    askConfirm('Remove this job? It will vanish from the garden.', async () => {
      const job = jobs.find(j => j.id === id);
      if (!job) return;
      await saveToFB(`${PATHS.jobs}/${id}`, { ...job, deleted: true });
      showToast('Job removed');
    }, true);
  };

  const addShopItem = async (item) => {
    const id = `custom-${Date.now()}`;
    await saveToFB(`${PATHS.shop}/${id}`, { ...item, id });
  };

  const deleteShopItem = async (id) => {
    await saveToFB(`${PATHS.shop}/${id}`, null);
  };

  const updateShopItem = async (id, updates) => {
    await saveToFB(`${PATHS.shop}/${id}`, { ...updates, id });
  };

  const toggleHoliday = async () => {
    const newState = { ...state, holidayMode: !state.holidayMode };
    await saveToFB(PATHS.state, newState);
    showToast(newState.holidayMode ? '🏝️ Garden dormant' : '☀️ Garden back in action!');
  };

  const updateState = async (updates) => {
    const newState = { ...state, ...updates };
    await saveToFB(PATHS.state, newState);
  };

  const giveHighFive = async (entry) => {
    const hfEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: nowISO(),
      user,
      forUser: entry.user,
      forJobId: entry.jobId,
      forJobName: entry.jobName,
      forJobEmoji: entry.jobEmoji,
      type: 'highfive',
    };
    await saveToFB(`${PATHS.journal}/${hfEntry.id}`, hfEntry);
    setHighFiveAnimation(true);
    setTimeout(() => setHighFiveAnimation(null), 1500);
    showToast(`🙌 High five sent to ${entry.user}!`);
  };

  const resetAll = () => {
    askConfirm(
      'Reset EVERYTHING? Wipes all points, journal, jobs, the lot. Cannot be undone.',
      () => {
        askConfirm('Are you really sure? Last chance!', async () => {
          const today = nowISO();
          const freshJobs = PRESET_JOBS.map(p => ({
            ...p,
            lastCompleted: p.type === 'recurring' ? today : null,
            lastCompletedBy: null,
            urgencyOverride: null,
            deleted: false,
            assignedTo: 'either',
          }));
          await Promise.all([
            saveToFB(PATHS.state, defaultState()),
            saveToFB(PATHS.jobs, Object.fromEntries(freshJobs.map(j => [j.id, j]))),
            saveToFB(PATHS.journal, null),
            saveToFB(PATHS.shop, Object.fromEntries(PRESET_SHOP.map(s => [s.id, s]))),
          ]);
          showToast('Garden reset 🌱');
        }, true);
      },
      true
    );
  };

  // -------------------------------------------------------------------------
  // GUARDS
  // -------------------------------------------------------------------------

  if (loading || !state) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(180deg,#FDD8C7 0%,#FAF6EC 60%,#B8C99F 100%)'}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'4rem',marginBottom:'1rem'}} className="anim-pulse">🌱</div>
          <p style={{fontFamily:'Caveat, cursive',fontSize:'22px',color:'#3D2A1F'}}>The garden is waking up...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <UserSelect onSelect={(u) => { localStorage.setItem('homestead-user', u); setUser(u); }} />;
  }

  const activeJobs = jobs.filter(j => !j.deleted);

  return (
    <div className="min-h-screen pb-24" style={{background:'#FAF6EC', fontFamily:'Quicksand, sans-serif'}}>
      <Header
        user={user}
        partner={partner}
        state={state}
        season={season}
        currentLevel={currentLevel}
        nextLevel={nextLevel}
        totalLifetime={totalLifetime}
        monthlyAvailable={monthlyAvailable}
        monthlyUnlocked={monthlyUnlocked}
        hotStreakCount={hotStreakCount}
        hotStreakActive={hotStreakActive}
        onSettings={() => setShowSettings(true)}
      />

      <main className="px-4 pt-4 max-w-2xl mx-auto">
        {view === 'garden' && (
          <>
            <PartnerActivityPeek journal={journal} user={user} partner={partner} onHighFive={giveHighFive}/>
            <GardenView
              jobs={activeJobs}
              state={state}
              user={user}
              partner={partner}
              onZoneTap={setSelectedZone}
              currentLevel={currentLevel}
              season={season}
            />
          </>
        )}
        {view === 'jobs' && (
          <JobsView
            jobs={activeJobs}
            user={user}
            holidayMode={state.holidayMode}
            hotStreakActive={hotStreakActive}
            onComplete={completeJob}
            onAdd={() => setShowAddJob(true)}
            onEdit={setEditJob}
            onDelete={deleteJob}
            onTogglePause={(j) => updateJob(j.id, { urgencyOverride: j.urgencyOverride === 'paused' ? null : 'paused' })}
            onAssign={(j, who) => updateJob(j.id, { assignedTo: who })}
          />
        )}
        {view === 'shop' && (
          <ShopView
            shop={shop}
            state={state}
            monthlyAvailable={monthlyAvailable}
            totalLifetime={totalLifetime}
            onBuy={buyReward}
            onAdd={() => setShowAddShopItem(true)}
            onDelete={deleteShopItem}
            onEdit={setEditShopItem}
          />
        )}
        {view === 'journal' && (
          <JournalView journal={journal} user={user} onHighFive={giveHighFive}/>
        )}
      </main>

      <BottomNav view={view} setView={setView}/>

      {/* Modals */}
      {showWelcome && <WelcomeModal user={user} onClose={() => setShowWelcome(false)}/>}
      {selectedZone && (
        <ZoneModal
          zone={selectedZone}
          jobs={activeJobs.filter(j => j.zone === selectedZone)}
          user={user}
          holidayMode={state.holidayMode}
          hotStreakActive={hotStreakActive}
          onClose={() => setSelectedZone(null)}
          onComplete={completeJob}
        />
      )}
      {showAddJob && <JobFormModal mode="add" onClose={() => setShowAddJob(false)} onSave={(j) => { addJob(j); setShowAddJob(false); }}/>}
      {editJob && <JobFormModal mode="edit" job={editJob} onClose={() => setEditJob(null)} onSave={(j) => { updateJob(editJob.id, j); setEditJob(null); }}/>}
      {showAddShopItem && <AddShopItemModal mode="add" state={state} onClose={() => setShowAddShopItem(false)} onSave={(i) => { addShopItem(i); setShowAddShopItem(false); }}/>}
      {editShopItem && <AddShopItemModal mode="edit" item={editShopItem} state={state} onClose={() => setEditShopItem(null)} onSave={(i) => { updateShopItem(editShopItem.id, i); setEditShopItem(null); }}/>}
      {showSettings && (
        <SettingsModal
          state={state}
          user={user}
          onClose={() => setShowSettings(false)}
          onUpdate={updateState}
          onToggleHoliday={toggleHoliday}
          onSwitchUser={() => { localStorage.removeItem('homestead-user'); setUser(null); setShowSettings(false); }}
          onReset={resetAll}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          danger={confirmDialog.danger}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
        />
      )}
      {celebration && <CelebrationOverlay celebration={celebration} onClose={() => setCelebration(null)}/>}
      {highFiveAnimation && <HighFiveAnimation/>}

      {/* Toast */}
      {toast && (
        <div className="toast" style={{borderColor: toast.type === 'error' ? '#DC2626' : '#5C7A50', background: toast.type === 'error' ? '#FECACA' : '#FAF6EC'}}>
          <span>{toast.msg}</span>
          {toast.actionLabel && toast.actionFn && (
            <button onClick={toast.actionFn} className="toast-action">{toast.actionLabel}</button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// USER SELECT
// =============================================================================

function UserSelect({ onSelect }) {
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',background:'linear-gradient(180deg,#FDD8C7 0%,#FAF6EC 50%,#B8C99F 100%)'}}>
      <div style={{textAlign:'center',maxWidth:'400px',width:'100%'}}>
        <div style={{fontSize:'4rem',marginBottom:'1rem'}}>🌻</div>
        <h1 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'3rem',color:'#3D2A1F',marginBottom:'0.25rem'}}>Homestead</h1>
        <p style={{fontFamily:'Caveat, cursive',fontSize:'22px',color:'#5C5044',marginBottom:'2.5rem'}}>tend the garden together</p>
        <p className="text-sm uppercase tracking-widest font-semibold" style={{color:'#5C5044',marginBottom:'1rem'}}>Who's tending today?</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
          <button onClick={() => onSelect('George')} className="user-card">
            <div style={{fontSize:'3rem',marginBottom:'0.5rem'}}>🌻</div>
            <span style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem'}}>George</span>
          </button>
          <button onClick={() => onSelect('Sammy')} className="user-card">
            <div style={{fontSize:'3rem',marginBottom:'0.5rem'}}>🌷</div>
            <span style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem'}}>Sammy</span>
          </button>
        </div>
        <p className="text-xs italic" style={{color:'#7E7268',marginTop:'2rem'}}>Each device remembers who you are. Change later in settings.</p>
      </div>
    </div>
  );
}

// =============================================================================
// HEADER
// =============================================================================

function Header({ user, partner, state, season, currentLevel, nextLevel, totalLifetime, monthlyAvailable, monthlyUnlocked, hotStreakCount, hotStreakActive, onSettings }) {
  const myEmoji = user === 'George' ? '🌻' : '🌷';
  const partnerEmoji = partner === 'George' ? '🌻' : '🌷';
  const progressToNext = nextLevel
    ? ((totalLifetime - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold)) * 100
    : 100;
  const myWeekly = state.weeklyProgress?.[user] || 0;
  const myTarget = state.weeklyTargets?.[user] || 200;
  const partnerWeekly = state.weeklyProgress?.[partner] || 0;
  const partnerTarget = state.weeklyTargets?.[partner] || 200;
  const monthName = new Date().toLocaleString('en-GB', { month: 'long' });
  const monthProgress = (state.monthSeeds / state.monthlyTarget) * 100;
  const monthThresholdReached = state.monthSeeds >= (state.monthlyTarget * state.thresholdPct / 100);

  return (
    <div className={`hero ${state.holidayMode ? 'hero-holiday' : ''}`}>
      <div className="hero-top">
        <div>
          <p className="text-xs uppercase tracking-widest" style={{color:'#5C5044'}}>{season.emoji} {season.name}</p>
          <h1 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.75rem',color:'#3D2A1F',lineHeight:1}}>{currentLevel.name}</h1>
          <p style={{fontFamily:'Caveat, cursive',fontSize:'17px',color:'#5C5044',fontStyle:'italic',marginTop:'0.25rem'}}>{currentLevel.description}</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
          {state.holidayMode && <span className="badge-sky">🏝️ Dormant</span>}
          {hotStreakActive && <span className="badge-orange">🔥 ×{hotStreakCount}</span>}
          <button onClick={onSettings} className="settings-btn" aria-label="Settings">⚙️</button>
        </div>
      </div>

      {/* Monthly £ pot - the headline */}
      <div className="card-money">
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'0.5rem'}}>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{color:'#5C5044'}}>{monthName} Pot</p>
            <p style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'2.25rem',color:'#3D2A1F',lineHeight:1}}>£{monthlyAvailable.toFixed(2)}</p>
            <p className="text-xs" style={{color:'#5C5044'}}>
              available to spend
              {state.monthBalanceCarry > 0 && ` (incl. £${state.monthBalanceCarry.toFixed(2)} carried over)`}
            </p>
          </div>
          <div style={{textAlign:'right'}}>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{color:'#5C5044'}}>Streak</p>
            <p style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'2.25rem',color:'#3D2A1F',lineHeight:1}}>🔥 {state.streakDays}</p>
            <p className="text-xs" style={{color:'#5C5044'}}>days</p>
          </div>
        </div>
        {/* Monthly progress bar */}
        <div style={{marginTop:'0.75rem'}}>
          <div className="bar-row">
            <span>{state.monthSeeds} / {state.monthlyTarget} seeds</span>
            <span>{monthThresholdReached ? `Full £${state.monthlyBudget} unlocked!` : `${state.thresholdPct}% target → £${state.monthlyBudget}`}</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{width: `${Math.min(100, monthProgress)}%`, background: monthThresholdReached ? 'linear-gradient(90deg, #FBBF24, #F59E0B)' : 'linear-gradient(90deg, #34D399, #FBBF24)'}}/>
            {/* Threshold marker */}
            <div className="bar-marker" style={{left: `${state.thresholdPct}%`}}/>
          </div>
        </div>
      </div>

      {/* Level progress */}
      {nextLevel && (
        <div style={{marginTop:'0.5rem'}}>
          <div className="bar-row">
            <span>{currentLevel.name}</span>
            <span>{Math.max(0, nextLevel.threshold - totalLifetime)} to {nextLevel.name}</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{width: `${progressToNext}%`, background:'linear-gradient(90deg,#5C8048,#FBBF24)'}}/>
          </div>
        </div>
      )}

      {/* Individual contribution cards */}
      <div className="contrib-grid">
        <ContribCard name={user}     emoji={myEmoji}      weekly={myWeekly}      target={myTarget}      isMe={true}  hotCount={hotStreakCount}/>
        <ContribCard name={partner}  emoji={partnerEmoji} weekly={partnerWeekly} target={partnerTarget} isMe={false} hotCount={state.hotStreakCount?.[partner] || 0}/>
      </div>
    </div>
  );
}

function ContribCard({ name, emoji, weekly, target, isMe, hotCount }) {
  const pct = Math.min(100, (weekly / target) * 100);
  const hit = weekly >= target;
  return (
    <div className={`contrib-card ${isMe ? 'contrib-me' : ''}`}>
      <div className="contrib-row">
        <span className="contrib-name">
          <span style={{fontSize:'1.1rem'}}>{emoji}</span> {name}
          {isMe && <span className="contrib-you">YOU</span>}
        </span>
        {hit ? <span className="contrib-target">✓ TARGET</span> : (hotCount >= 3 ? <span className="contrib-hot">🔥 ×{hotCount}</span> : null)}
      </div>
      <div className="bar-thin">
        <div className="bar-fill" style={{width: `${pct}%`, background: hit ? '#FBBF24' : '#34D399'}}/>
      </div>
      <p className="text-xs" style={{color:'#7E7268'}}>{weekly} / {target} this week</p>
    </div>
  );
}

// =============================================================================
// PARTNER ACTIVITY PEEK
// =============================================================================

function PartnerActivityPeek({ journal, user, partner, onHighFive }) {
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const recent = journal.filter(e =>
    e.user === partner && e.type === 'completed' && e.timestamp > dayAgo
  ).slice(0, 4);

  if (recent.length === 0) return null;
  const totalSeeds = recent.reduce((s, e) => s + (e.points || 0), 0);
  const partnerEmoji = partner === 'George' ? '🌻' : '🌷';

  return (
    <div className="peek">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.5rem'}}>
        <p style={{fontSize:'0.9rem'}}>
          <span style={{fontSize:'1.1rem'}}>{partnerEmoji}</span> <strong>{partner}</strong> has been busy! <span style={{fontWeight:600,color:'#5C8048'}}>+{totalSeeds} 🌱</span>
        </p>
        <button onClick={() => onHighFive(recent[0])} className="hf-btn">🙌 Hi5</button>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:'0.4rem'}}>
        {recent.map(e => (
          <span key={e.id} className="chip">{e.jobEmoji} {e.jobName}</span>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// GARDEN VIEW (the illustrated picture)
// =============================================================================

function GardenView({ jobs, state, user, partner, onZoneTap, currentLevel, season }) {
  const zoneHealth = useMemo(() => {
    const map = {};
    Object.keys(ZONES).forEach(z => { map[z] = getZoneHealth(z, jobs, state.holidayMode); });
    return map;
  }, [jobs, state.holidayMode]);

  const zoneCounts = useMemo(() => {
    const map = {};
    Object.keys(ZONES).forEach(z => { map[z] = 0; });
    jobs.forEach(j => {
      const u = getJobUrgency(j, state.holidayMode);
      if (u === 'due-soon' || u === 'overdue' || u === 'neglected') {
        map[j.zone] = (map[j.zone] || 0) + 1;
      }
    });
    return map;
  }, [jobs, state.holidayMode]);

  const [rodneyPos, setRodneyPos] = useState({ x: 95, y: 245 });
  const [forrestPos, setForrestPos] = useState({ x: 30, y: 248 });
  useEffect(() => {
    // Rodney roams the central path area
    const r = setInterval(() => setRodneyPos({
      x: 80 + Math.random() * 35,
      y: 240 + Math.random() * 10,
    }), 4000);
    // Forrest hangs near the bedroom/kitchen corner, well clear of other zones
    const f = setInterval(() => setForrestPos({
      x: 18 + Math.random() * 20,
      y: 244 + Math.random() * 8,
    }), 5500);
    return () => { clearInterval(r); clearInterval(f); };
  }, []);

  const showSwifts = (state.streakDays || 0) >= 3 && !state.holidayMode;
  const showButterflies = (state.streakDays || 0) >= 7 && !state.holidayMode;
  const showCouple = currentLevel.level >= 5;
  const isHoliday = state.holidayMode;
  const overall = Math.round(Object.values(zoneHealth).reduce((s, h) => s + h, 0) / Object.values(zoneHealth).length);

  const palette = isHoliday ? {
    skyTop: '#B5C8DC', skyMid: '#D2DCE5', skyBot: '#E2E8E0',
    grassTop: '#9EAA88', grassBot: '#7E8A6C',
    hillBack: '#9AA88A', hillFront: '#7E8A6E',
  } : overall >= 4 ? {
    skyTop: '#F4C9A1', skyMid: '#FAE6D0', skyBot: '#E8F0E0',
    grassTop: '#94BC68', grassBot: '#6E9148',
    hillBack: '#A4BB80', hillFront: '#7E9A5A',
  } : overall >= 3 ? {
    skyTop: '#EFCDAB', skyMid: '#F5E2CC', skyBot: '#E0E8DC',
    grassTop: '#9CB876', grassBot: '#7C955A',
    hillBack: '#9CB084', hillFront: '#7E955E',
  } : overall >= 2 ? {
    skyTop: '#E5C9B0', skyMid: '#EDDCC8', skyBot: '#DAE0D4',
    grassTop: '#A4AE82', grassBot: '#888E68',
    hillBack: '#9CA088', hillFront: '#80866E',
  } : {
    skyTop: '#D9C8B5', skyMid: '#E0D4C2', skyBot: '#D2D5CA',
    grassTop: '#A8AA88', grassBot: '#888A70',
    hillBack: '#969688', hillFront: '#80806E',
  };

  return (
    <>
      <Section title="The Homestead" subtitle="tap any item in the picture to tend it">
        <div className="garden-frame">
          <svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice"
               style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}>
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.skyTop}/>
                <stop offset="60%" stopColor={palette.skyMid}/>
                <stop offset="100%" stopColor={palette.skyBot}/>
              </linearGradient>
              <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.grassTop}/>
                <stop offset="100%" stopColor={palette.grassBot}/>
              </linearGradient>
              <linearGradient id="path" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E5D4AA"/>
                <stop offset="100%" stopColor="#C9B57E"/>
              </linearGradient>
              <radialGradient id="pondGrad" cx="0.3" cy="0.3">
                <stop offset="0%" stopColor="#A0CADE"/>
                <stop offset="100%" stopColor="#4D87B0"/>
              </radialGradient>
              <radialGradient id="sunGrad" cx="0.5" cy="0.5">
                <stop offset="0%" stopColor="#FFE9A8"/>
                <stop offset="60%" stopColor="#FFCB6E"/>
                <stop offset="100%" stopColor="#F5B048" stopOpacity="0.9"/>
              </radialGradient>
              <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(60,40,20,0.18)" strokeWidth="0.5"/>
              </pattern>
              <pattern id="crosshatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
                <line x1="0" y1="0" x2="0" y2="3" stroke="rgba(60,40,20,0.12)" strokeWidth="0.3"/>
                <line x1="0" y1="0" x2="3" y2="0" stroke="rgba(60,40,20,0.08)" strokeWidth="0.3"/>
              </pattern>
              <pattern id="paperGrain" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="rgba(160,130,90,0)"/>
                <circle cx="3" cy="7" r="0.3" fill="rgba(90,60,30,0.06)"/>
                <circle cx="14" cy="22" r="0.25" fill="rgba(90,60,30,0.05)"/>
                <circle cx="28" cy="11" r="0.35" fill="rgba(90,60,30,0.07)"/>
                <circle cx="35" cy="32" r="0.2" fill="rgba(90,60,30,0.04)"/>
                <circle cx="9" cy="35" r="0.3" fill="rgba(90,60,30,0.05)"/>
                <circle cx="22" cy="6" r="0.22" fill="rgba(90,60,30,0.04)"/>
              </pattern>
              <filter id="wilt-3"><feColorMatrix type="saturate" values="0.7"/></filter>
              <filter id="wilt-2"><feColorMatrix type="saturate" values="0.45"/></filter>
              <filter id="wilt-1"><feColorMatrix type="saturate" values="0.2"/></filter>
              <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="0.6"/>
                <feOffset dx="0.3" dy="0.6" result="offsetblur"/>
                <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
                <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              {/* Hand-drawn wobble: turbulence displaces edges to feel sketched.
                  Scale kept gentle (0.45) so text labels stay readable. */}
              <filter id="sketch" x="-2%" y="-2%" width="104%" height="104%">
                <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="3" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.45" xChannelSelector="R" yChannelSelector="G"/>
              </filter>
              {/* Stronger wobble for foliage and organic things */}
              <filter id="sketchRough" x="-3%" y="-3%" width="106%" height="106%">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G"/>
              </filter>
              {/* Paint-bleed effect for soft watercolour tones */}
              <filter id="watercolour" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="2" result="grain"/>
                <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0" result="grainAlpha"/>
                <feComposite in="grainAlpha" in2="SourceGraphic" operator="in" result="textured"/>
                <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="textured"/></feMerge>
              </filter>
            </defs>

            {/* Hand-drawn wobble applied to the whole scene */}
            <g filter="url(#sketch)">

            {/* SKY */}
            <rect x="0" y="0" width="200" height="115" fill="url(#sky)"/>
            <rect x="0" y="0" width="200" height="115" fill="url(#paperGrain)" opacity="0.7"/>

            {/* Sun with rays */}
            {isHoliday ? (
              <g><circle cx="165" cy="32" r="11" fill="#E8E4D2"/><circle cx="161" cy="29" r="3" fill="#D5D0BC" opacity="0.6"/></g>
            ) : (
              <g>
                {/* Soft outer glow */}
                <circle cx="165" cy="32" r="20" fill="#FFE9A8" opacity="0.25"/>
                <circle cx="165" cy="32" r="16" fill="#FFD580" opacity="0.4"/>
                {/* Sun rays */}
                {Array.from({length: 12}).map((_, i) => {
                  const a = (i * 30) * Math.PI / 180;
                  const x1 = 165 + Math.cos(a) * 17;
                  const y1 = 32 + Math.sin(a) * 17;
                  const x2 = 165 + Math.cos(a) * 22;
                  const y2 = 32 + Math.sin(a) * 22;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F5B048" strokeWidth="0.7" strokeLinecap="round" opacity="0.7"/>;
                })}
                <circle cx="165" cy="32" r="14" fill="url(#sunGrad)"/>
                <circle cx="161" cy="28" r="4" fill="#FFF5D4" opacity="0.6"/>
                {/* Smiling face */}
                <circle cx="160" cy="30" r="0.7" fill="#A85420" opacity="0.7"/>
                <circle cx="170" cy="30" r="0.7" fill="#A85420" opacity="0.7"/>
                <path d="M 160,35 Q 165,38 170,35" stroke="#A85420" strokeWidth="0.6" fill="none" strokeLinecap="round" opacity="0.7"/>
              </g>
            )}

            {/* Hand-drawn fluffy clouds */}
            <g opacity="0.92">
              <path d="M 22,22 Q 18,22 19,18 Q 22,12 28,15 Q 32,10 38,14 Q 45,11 48,17 Q 54,15 55,22 Q 58,26 52,28 Q 48,30 42,28 Q 36,30 30,28 Q 22,28 22,22 Z"
                    fill="white" stroke="rgba(60,40,20,0.18)" strokeWidth="0.5"/>
              {/* Subtle shading */}
              <path d="M 22,25 Q 30,27 42,26 Q 50,27 54,25" stroke="rgba(60,40,20,0.08)" strokeWidth="0.4" fill="none"/>
            </g>
            <g opacity="0.75">
              <path d="M 95,42 Q 92,42 93,38 Q 96,34 102,36 Q 108,32 114,38 Q 120,38 121,44 Q 122,48 116,48 Q 108,50 100,48 Q 95,46 95,42 Z"
                    fill="white" stroke="rgba(60,40,20,0.15)" strokeWidth="0.4"/>
              <path d="M 95,46 Q 105,47 116,46" stroke="rgba(60,40,20,0.08)" strokeWidth="0.3" fill="none"/>
            </g>
            <g opacity="0.6">
              <path d="M 60,62 Q 58,62 59,59 Q 62,57 66,59 Q 70,57 73,60 Q 76,61 74,64 Q 70,66 64,65 Q 60,65 60,62 Z"
                    fill="white" stroke="rgba(60,40,20,0.12)" strokeWidth="0.3"/>
            </g>

            {/* Distant rolling hills with hatched texture */}
            <path d="M 0,98 Q 40,76 80,88 T 160,84 T 220,94 L 220,118 L 0,118 Z" fill={palette.hillBack} opacity="0.65"/>
            <path d="M 0,108 Q 50,86 110,100 T 220,105 L 220,118 L 0,118 Z" fill={palette.hillFront} opacity="0.85"/>
            {/* Hint of a distant farmhouse */}
            {!isHoliday && (
              <g opacity="0.45">
                <rect x="135" y="92" width="6" height="6" fill="#9C7050"/>
                <polygon points="134,92 142,92 138,88" fill="#7A4A30"/>
                <line x1="138" y1="92" x2="138" y2="88" stroke="rgba(60,40,20,0.3)" strokeWidth="0.2"/>
              </g>
            )}

            {/* Distant trees with foliage clusters */}
            <g opacity="0.7">
              <ellipse cx="20" cy="92" rx="6" ry="8" fill="#6E8C4A"/>
              <ellipse cx="17" cy="88" rx="3" ry="3.5" fill="#84A05C"/>
              <ellipse cx="23" cy="89" rx="2.8" ry="3" fill="#84A05C"/>
              <path d="M 17,90 Q 19,84 22,90 Q 25,86 26,92" stroke="#4F6B30" strokeWidth="0.3" fill="none" opacity="0.5"/>
              <rect x="19" y="94" width="2" height="6" fill="#6B4F32"/>
              <ellipse cx="180" cy="90" rx="7" ry="9" fill="#6E8C4A"/>
              <ellipse cx="176" cy="86" rx="3" ry="3.5" fill="#84A05C"/>
              <ellipse cx="184" cy="87" rx="3.2" ry="3.2" fill="#84A05C"/>
              <path d="M 175,88 Q 178,83 182,88 Q 184,84 186,90" stroke="#4F6B30" strokeWidth="0.3" fill="none" opacity="0.5"/>
              <rect x="179" y="93" width="2" height="6" fill="#6B4F32"/>
              {/* Tiny mid-distance bird silhouettes */}
              {!isHoliday && (
                <g fill="#5C4030" opacity="0.55">
                  <path d="M 78,68 q 1.2,-1 2.4,0 q 1.2,-1 2.4,0" stroke="#5C4030" strokeWidth="0.4" fill="none"/>
                  <path d="M 90,75 q 1,-0.8 2,0 q 1,-0.8 2,0" stroke="#5C4030" strokeWidth="0.35" fill="none"/>
                </g>
              )}
            </g>

            {/* === HEDGE (zone) === */}
            <ZoneGroup id="hedge" health={zoneHealth.hedge} count={zoneCounts.hedge}
                       onTap={() => onZoneTap('hedge')} labelX={100} labelY={113} label="Hedge">
              {(() => {
                const h = zoneHealth.hedge;
                const dark  = h >= 4 ? '#3D6B33' : h >= 3 ? '#4F7A40' : h >= 2 ? '#6E7858' : '#8C8870';
                const mid   = h >= 4 ? '#5C8C50' : h >= 3 ? '#6E9054' : h >= 2 ? '#869268' : '#A09878';
                const light = h >= 4 ? '#7AA85C' : h >= 3 ? '#85A062' : h >= 2 ? '#9CA478' : '#B0AC88';
                const lighter = h >= 4 ? '#9DC078' : h >= 3 ? '#A5B87E' : h >= 2 ? '#B5BC92' : '#C0BCA0';
                return (
                  <g>
                    {/* Back layer (deepest shadow) */}
                    <path d="M -5,118 Q 8,86 18,108 Q 28,82 40,106 Q 52,78 64,104 Q 76,80 88,106 Q 100,76 112,104 Q 124,78 136,106 Q 148,78 160,106 Q 172,78 184,106 Q 196,82 210,106 L 210,124 L -5,124 Z" fill={dark}/>
                    {/* Mid layer */}
                    <path d="M -5,118 Q 8,94 18,110 Q 28,90 40,108 Q 52,88 64,106 Q 76,90 88,108 Q 100,86 112,106 Q 124,88 136,108 Q 148,88 160,108 Q 172,88 184,108 Q 196,90 210,106 L 210,118 L -5,118 Z" fill={mid}/>
                    {/* Highlight layer */}
                    <path d="M -5,118 Q 8,102 18,114 Q 28,98 40,112 Q 52,96 64,110 Q 76,98 88,112 Q 100,94 112,110 Q 124,96 136,112 Q 148,96 160,112 Q 172,96 184,112 Q 196,98 210,108 L 210,118 L -5,118 Z" fill={light}/>
                    {/* Many leaf clusters with depth */}
                    {[[5,99,2.4],[12,93,2],[18,90,2.6],[25,95,1.8],[30,92,2.4],[36,90,2],[42,88,2.6],[48,93,2],[55,91,2.4],[61,87,2.2],[68,90,2.6],[75,93,2],[82,89,2.4],[88,87,2.2],[95,84,2.6],[102,89,2.2],[108,87,2.4],[115,84,2.2],[122,87,2.6],[128,89,2],[135,86,2.4],[142,84,2.2],[148,87,2.6],[155,84,2.2],[162,87,2.4],[168,90,2],[175,86,2.6],[182,84,2.2],[190,87,2.4]].map(([cx,cy,r],i) => (
                      <g key={i}>
                        <circle cx={cx} cy={cy+1} r={r} fill={mid}/>
                        <circle cx={cx-0.6} cy={cy} r={r*0.85} fill={light}/>
                        <circle cx={cx+0.4} cy={cy-0.4} r={r*0.6} fill={lighter}/>
                      </g>
                    ))}
                    {/* Tiny flowers when thriving */}
                    {h >= 4 && (
                      <g>
                        <g><circle cx="32" cy="89" r="0.8" fill="#F5B5C5"/><circle cx="32" cy="89" r="0.3" fill="#F2D78A"/></g>
                        <g><circle cx="58" cy="86" r="0.8" fill="#FFFFFF"/><circle cx="58" cy="86" r="0.3" fill="#F2D78A"/></g>
                        <g><circle cx="78" cy="88" r="0.8" fill="#F5B5C5"/><circle cx="78" cy="88" r="0.3" fill="#F2D78A"/></g>
                        <g><circle cx="105" cy="84" r="0.8" fill="#E89BB0"/><circle cx="105" cy="84" r="0.3" fill="#F2D78A"/></g>
                        <g><circle cx="125" cy="86" r="0.8" fill="#FCEAA8"/><circle cx="125" cy="86" r="0.3" fill="#A85420"/></g>
                        <g><circle cx="148" cy="86" r="0.8" fill="#FFFFFF"/><circle cx="148" cy="86" r="0.3" fill="#F2D78A"/></g>
                        <g><circle cx="172" cy="86" r="0.8" fill="#F5B5C5"/><circle cx="172" cy="86" r="0.3" fill="#F2D78A"/></g>
                        {/* Tiny bee */}
                        <g transform="translate(85,80)">
                          <ellipse cx="0" cy="0" rx="1.2" ry="0.7" fill="#F5C66C"/>
                          <line x1="-0.4" y1="-0.5" x2="-0.4" y2="0.5" stroke="#3D2A1F" strokeWidth="0.25"/>
                          <line x1="0.2" y1="-0.5" x2="0.2" y2="0.5" stroke="#3D2A1F" strokeWidth="0.25"/>
                          <ellipse cx="-0.5" cy="-0.7" rx="0.6" ry="0.4" fill="rgba(255,255,255,0.7)"/>
                        </g>
                      </g>
                    )}
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === PICKET FENCE with character === */}
            <g>
              {Array.from({length: 36}).map((_, i) => (
                <g key={i}>
                  <rect x={i * 6 - 4} y="115" width="3.5" height="13" fill="#C9A57A" stroke="#7A5F3D" strokeWidth="0.3"/>
                  {/* Pointed top */}
                  <polygon points={`${i*6-4},115 ${i*6-4+1.75},113 ${i*6-4+3.5},115`} fill="#B8966B" stroke="#7A5F3D" strokeWidth="0.3"/>
                  {/* Subtle wood grain */}
                  <line x1={i*6-4+1.7} y1="116" x2={i*6-4+1.7} y2="127" stroke="rgba(122,95,61,0.4)" strokeWidth="0.2"/>
                </g>
              ))}
              <rect x="-5" y="120" width="210" height="1.4" fill="#8B6F47"/>
              <rect x="-5" y="125.5" width="210" height="1.4" fill="#8B6F47"/>
              {/* Garden gate in centre — slightly different colour */}
              <g>
                <rect x="94" y="113" width="4" height="15" fill="#A88860" stroke="#6B4A2A" strokeWidth="0.4"/>
                <rect x="100" y="113" width="4" height="15" fill="#A88860" stroke="#6B4A2A" strokeWidth="0.4"/>
                <line x1="94" y1="118" x2="104" y2="118" stroke="#6B4A2A" strokeWidth="0.4"/>
                <line x1="94" y1="123" x2="104" y2="123" stroke="#6B4A2A" strokeWidth="0.4"/>
                <line x1="94" y1="128" x2="104" y2="118" stroke="#6B4A2A" strokeWidth="0.3" opacity="0.5"/>
              </g>
            </g>

            {/* === LAWN === */}
            <rect x="0" y="128" width="200" height="152" fill="url(#grass)"/>
            <rect x="0" y="128" width="200" height="152" fill="url(#paperGrain)" opacity="0.5"/>

            {/* Many grass tufts scattered */}
            {[[8,142],[22,150],[40,148],[58,144],[78,158],[120,165],[150,148],[170,155],[15,200],[42,205],[65,212],[88,225],[112,212],[142,215],[170,225],[8,260],[155,265],[185,255]].map(([cx,cy],i) => {
              const c = overall >= 3 ? '#5C8035' : '#8C9362';
              return <g key={i}><path d={`M ${cx},${cy} l -1.2,-3 M ${cx},${cy} l 0,-4 M ${cx},${cy} l 1.2,-3`} stroke={c} strokeWidth="0.5" fill="none" opacity="0.7"/></g>;
            })}

            {/* Daisy clusters scattered in lawn — when thriving */}
            {overall >= 3 && (
              <g>
                {[[28,162],[88,178],[152,178],[35,250],[125,258]].map(([cx,cy],i) => (
                  <g key={i}>
                    {[[0,0],[2.5,1],[1,3],[-1.5,2.5],[-2,0.5]].map(([dx,dy],j) => (
                      <g key={j}>
                        <circle cx={cx+dx} cy={cy+dy} r="0.9" fill="white"/>
                        <circle cx={cx+dx} cy={cy+dy} r="0.35" fill="#F5C66C"/>
                      </g>
                    ))}
                  </g>
                ))}
              </g>
            )}

            {/* Curving stepping-stone path */}
            <g>
              {[[100,134,5,3],[97,144,5.5,3.2],[102,154,5.2,3],[95,164,5.4,3.1],[101,174,5.3,3],[105,184,5.5,3.2],[101,194,5.4,3.1],[97,204,5.6,3.2],[100,214,5.5,3.1],[103,224,5.4,3],[98,234,5.6,3.2],[101,244,5.4,3.1],[103,254,5.5,3.1],[100,264,5.6,3.2],[97,274,5.5,3.1]].map(([cx,cy,rx,ry],i) => (
                <g key={i}>
                  <ellipse cx={cx+0.3} cy={cy+0.5} rx={rx} ry={ry} fill="rgba(60,40,20,0.18)"/>
                  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#D6CBB0"/>
                  <ellipse cx={cx-0.6} cy={cy-0.4} rx={rx*0.55} ry={ry*0.55} fill="#E8DEC0" opacity="0.6"/>
                  <path d={`M ${cx-rx*0.4},${cy-0.4} Q ${cx},${cy-1} ${cx+rx*0.4},${cy-0.3}`} stroke="rgba(120,95,70,0.35)" strokeWidth="0.25" fill="none"/>
                </g>
              ))}
            </g>

            {/* === FLOWER BORDERS along base of fence === */}
            <g>
              {/* Cottage flowers in front of fence — tulips, daffodils */}
              {overall >= 3 && [
                {x: 70, y: 138, c: '#E89BB0'},
                {x: 76, y: 137, c: '#F5B5C5'},
                {x: 82, y: 138, c: '#D88A9F'},
                {x: 88, y: 137, c: '#FCEAA8'},
                {x: 114, y: 137, c: '#FCEAA8'},
                {x: 120, y: 138, c: '#E89BB0'},
                {x: 126, y: 137, c: '#FFFFFF'},
                {x: 132, y: 138, c: '#F5B5C5'},
              ].map(({x,y,c},i) => (
                <g key={`fl1-${i}`}>
                  <line x1={x} y1={y} x2={x} y2={y-5} stroke="#5C8048" strokeWidth="0.7"/>
                  <ellipse cx={x-1.3} cy={y-2.5} rx="1.2" ry="0.5" fill="#5C8048" transform={`rotate(-25 ${x-1.3} ${y-2.5})`}/>
                  {/* Tulip cup shape */}
                  <path d={`M ${x-1.5},${y-4} Q ${x-1.5},${y-7} ${x},${y-7.5} Q ${x+1.5},${y-7} ${x+1.5},${y-4} Q ${x+0.5},${y-5} ${x},${y-4.5} Q ${x-0.5},${y-5} ${x-1.5},${y-4} Z`} fill={c} stroke="#A85420" strokeWidth="0.25"/>
                </g>
              ))}
              {/* Foxgloves at edges */}
              {overall >= 3 && [
                {x: 5, y: 142, color: '#D88AB0'},
                {x: 195, y: 142, color: '#C57AA0'}
              ].map((fg,i) => (
                <g key={`fg-${i}`}>
                  <line x1={fg.x} y1={fg.y} x2={fg.x} y2={fg.y-13} stroke="#5C8048" strokeWidth="0.5"/>
                  {[0,1,2,3,4].map(j => (
                    <ellipse key={j} cx={fg.x + (j%2 ? 1.2 : -1.2)} cy={fg.y - 2 - j*2.3} rx="1.2" ry="1.5" fill={fg.color} stroke="#A85420" strokeWidth="0.18"/>
                  ))}
                  {/* Leaf at base */}
                  <ellipse cx={fg.x + 1.5} cy={fg.y - 0.5} rx="1.3" ry="0.6" fill="#5C8048" transform={`rotate(${fg.x < 100 ? 25 : -25} ${fg.x+1.5} ${fg.y-0.5})`}/>
                </g>
              ))}
            </g>

            {/* === GREENHOUSE (zone) — Victorian glasshouse === */}
            <ZoneGroup id="greenhouse" health={zoneHealth.greenhouse} count={zoneCounts.greenhouse}
                       onTap={() => onZoneTap('greenhouse')} labelX={153} labelY={170} label="Greenhouse">
              {(() => {
                const h = zoneHealth.greenhouse;
                const glassFill = h >= 4 ? '#D8EEE6' : h >= 3 ? '#CADDD3' : h >= 2 ? '#BFC8C0' : '#B0B5AE';
                const glassHi = h >= 4 ? '#EDF7F2' : h >= 3 ? '#DEE9E1' : '#D2D8D0';
                const frame = '#3D3530';
                return (
                  <g>
                    {/* Stone base */}
                    <rect x="136" y="160" width="48" height="6" fill="#A89072" stroke="#7A5F3D" strokeWidth="0.4"/>
                    <rect x="136" y="160" width="48" height="1.2" fill="#C5AB87"/>
                    {/* Stone block joints */}
                    <line x1="148" y1="160" x2="148" y2="166" stroke="#7A5F3D" strokeWidth="0.3"/>
                    <line x1="160" y1="160" x2="160" y2="166" stroke="#7A5F3D" strokeWidth="0.3"/>
                    <line x1="172" y1="160" x2="172" y2="166" stroke="#7A5F3D" strokeWidth="0.3"/>
                    <line x1="142" y1="163" x2="154" y2="163" stroke="#7A5F3D" strokeWidth="0.3"/>
                    <line x1="166" y1="163" x2="178" y2="163" stroke="#7A5F3D" strokeWidth="0.3"/>
                    {/* Glass body — main rectangle */}
                    <rect x="138" y="128" width="44" height="32" fill={glassFill} stroke={frame} strokeWidth="0.7"/>
                    {/* Roof — pitched */}
                    <polygon points="138,128 182,128 160,116" fill={glassHi} stroke={frame} strokeWidth="0.7"/>
                    {/* Cast-iron framework: vertical columns */}
                    <rect x="137.5" y="128" width="1" height="32" fill={frame}/>
                    <rect x="159.5" y="128" width="1" height="32" fill={frame}/>
                    <rect x="181.5" y="128" width="1" height="32" fill={frame}/>
                    {/* Horizontal rails */}
                    <rect x="138" y="138" width="44" height="0.7" fill={frame}/>
                    <rect x="138" y="148" width="44" height="0.7" fill={frame}/>
                    {/* Sub-divisions in panes */}
                    <line x1="148" y1="128" x2="148" y2="160" stroke={frame} strokeWidth="0.4"/>
                    <line x1="171" y1="128" x2="171" y2="160" stroke={frame} strokeWidth="0.4"/>
                    {/* Roof framework */}
                    <line x1="160" y1="116" x2="160" y2="128" stroke={frame} strokeWidth="0.6"/>
                    <line x1="138" y1="128" x2="160" y2="116" stroke={frame} strokeWidth="0.5"/>
                    <line x1="182" y1="128" x2="160" y2="116" stroke={frame} strokeWidth="0.5"/>
                    {/* Roof finial */}
                    <circle cx="160" cy="115" r="0.8" fill={frame}/>
                    <line x1="160" y1="115" x2="160" y2="113" stroke={frame} strokeWidth="0.3"/>
                    <circle cx="160" cy="113" r="0.5" fill="#C97D3A"/>
                    {/* Glass highlights / reflections */}
                    <polygon points="139,128 141,128 154,158 152,158" fill="white" opacity="0.18"/>
                    <polygon points="161,128 163,128 175,158 173,158" fill="white" opacity="0.14"/>
                    {/* Door */}
                    <rect x="156" y="142" width="8" height="18" fill={h >= 3 ? '#A8C9BB' : '#909790'} stroke={frame} strokeWidth="0.6"/>
                    {/* Door glass panel */}
                    <rect x="157" y="144" width="6" height="8" fill={glassHi} stroke={frame} strokeWidth="0.3"/>
                    <line x1="160" y1="144" x2="160" y2="152" stroke={frame} strokeWidth="0.25"/>
                    {/* Door handle */}
                    <circle cx="162.5" cy="156" r="0.5" fill="#C97D3A"/>
                    {/* Step at door */}
                    <rect x="155" y="166" width="10" height="1.5" fill="#7A5F3D"/>
                    {/* Plants visible inside greenhouse */}
                    {h >= 3 && (
                      <g>
                        {/* Left pane: tomato plant on cane */}
                        <line x1="142" y1="158" x2="142" y2="148" stroke="#7A5F3D" strokeWidth="0.4"/>
                        <ellipse cx="142" cy="156" rx="2.5" ry="2.2" fill="#5C8048"/>
                        <ellipse cx="143" cy="153" rx="2" ry="1.8" fill="#6E9054"/>
                        <ellipse cx="141" cy="150" rx="1.5" ry="1.5" fill="#7AA85C"/>
                        {/* Tomatoes */}
                        {h >= 4 && (
                          <>
                            <circle cx="143" cy="155" r="0.6" fill="#C84A3F"/>
                            <circle cx="141" cy="153" r="0.5" fill="#C84A3F"/>
                            <circle cx="142.5" cy="151" r="0.45" fill="#E68B3F"/>
                          </>
                        )}
                        {/* Middle: pots */}
                        <rect x="151" y="156" width="3" height="3" fill="#B85F3F" stroke="#7A4528" strokeWidth="0.2"/>
                        <ellipse cx="152.5" cy="155" rx="2" ry="1" fill="#5C8048"/>
                        <ellipse cx="152" cy="154" rx="1.2" ry="1.5" fill="#7AA85C"/>
                        {h >= 4 && <circle cx="152.5" cy="153" r="0.5" fill="#F5B5C5"/>}
                        {/* Right pane: hanging baskets and shelf */}
                        <line x1="167" y1="148" x2="180" y2="148" stroke="#7A5F3D" strokeWidth="0.3"/>
                        <rect x="173" y="156" width="3" height="3" fill="#B85F3F" stroke="#7A4528" strokeWidth="0.2"/>
                        <ellipse cx="174.5" cy="155" rx="2" ry="1" fill="#5C8048"/>
                        <ellipse cx="174" cy="153.5" rx="1.5" ry="1.8" fill="#7AA85C"/>
                        {/* Basil-like cluster */}
                        <ellipse cx="178" cy="155" rx="1.8" ry="1.5" fill="#5C8048"/>
                        <ellipse cx="177" cy="154" rx="1" ry="1.2" fill="#7AA85C"/>
                        {/* Hanging plant from ceiling */}
                        <line x1="145" y1="138.7" x2="145" y2="142" stroke="#7A5F3D" strokeWidth="0.25"/>
                        <ellipse cx="145" cy="143" rx="2" ry="1.2" fill="#7AA85C"/>
                        <path d="M 144,143.5 q -0.5,1.5 -0.3,2.5 M 145,143.5 q 0.2,1.8 0,2.8 M 146,143.5 q 0.5,1.5 0.3,2.5" stroke="#5C8048" strokeWidth="0.3" fill="none"/>
                        {h >= 4 && <circle cx="145" cy="146" r="0.4" fill="#F5B5C5"/>}
                      </g>
                    )}
                    {/* Watering can outside greenhouse */}
                    <g transform="translate(133,166)">
                      <ellipse cx="0" cy="2" rx="3" ry="0.6" fill="rgba(60,40,20,0.2)"/>
                      <rect x="-2.2" y="-1" width="4.5" height="3" rx="0.4" fill="#7DA4B8" stroke="#3D5C70" strokeWidth="0.3"/>
                      <path d="M 2.3,0 Q 4,0 4,1.5" stroke="#3D5C70" strokeWidth="0.4" fill="none"/>
                      <ellipse cx="4" cy="1.5" rx="0.4" ry="0.3" fill="#3D5C70"/>
                      <path d="M -2.2,0 Q -3,0 -3,-1 Q -3,-1.8 -2.2,-1.8" stroke="#3D5C70" strokeWidth="0.4" fill="none"/>
                    </g>
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === PLAYHOUSE (zone) — cottage with character === */}
            <ZoneGroup id="playhouse" health={zoneHealth.playhouse} count={zoneCounts.playhouse}
                       onTap={() => onZoneTap('playhouse')} labelX={40} labelY={185} label="Vinnie">
              {(() => {
                const h = zoneHealth.playhouse;
                const wall = h >= 4 ? '#F5DCC8' : h >= 3 ? '#E8CFB8' : h >= 2 ? '#D4C0AB' : '#BCB099';
                const wallShade = h >= 4 ? '#E5C6AE' : h >= 3 ? '#D8B89E' : '#BCA890';
                const trim = h >= 4 ? '#C97A7A' : h >= 3 ? '#B06A6A' : h >= 2 ? '#94706E' : '#7E6864';
                const roof = h >= 4 ? '#B05F4A' : h >= 3 ? '#9C5642' : h >= 2 ? '#8A5642' : '#705048';
                const roofDark = h >= 4 ? '#8C4A38' : h >= 3 ? '#7E4332' : '#604030';
                return (
                  <g>
                    {/* Front lawn flower border */}
                    {h >= 3 && (
                      <g>
                        <ellipse cx="20" cy="184" rx="1.5" ry="0.8" fill="#5C8048"/>
                        <circle cx="20" cy="183" r="0.5" fill="#F5B5C5"/>
                        <ellipse cx="60" cy="184" rx="1.5" ry="0.8" fill="#5C8048"/>
                        <circle cx="60" cy="183" r="0.5" fill="#FCEAA8"/>
                        <ellipse cx="62" cy="183" rx="0.5" ry="0.4" fill="#E89BB0"/>
                      </g>
                    )}
                    {/* Walls (with vertical plank texture) */}
                    <rect x="20" y="158" width="40" height="22" fill={wall} stroke="#A09080" strokeWidth="0.5"/>
                    {/* Subtle wall shading */}
                    <rect x="20" y="158" width="40" height="3" fill={wallShade} opacity="0.4"/>
                    {/* Wood plank vertical lines (visible) */}
                    {[24, 28, 32, 36, 40, 44, 48, 52, 56].map(x => (
                      <line key={x} x1={x} y1="158" x2={x} y2="180" stroke="rgba(150,120,90,0.35)" strokeWidth="0.25"/>
                    ))}
                    {/* Brick foundation */}
                    <rect x="20" y="178" width="40" height="2.5" fill="#A07258" stroke="#6B4A2A" strokeWidth="0.3"/>
                    <line x1="26" y1="178" x2="26" y2="180.5" stroke="#6B4A2A" strokeWidth="0.2"/>
                    <line x1="34" y1="178" x2="34" y2="180.5" stroke="#6B4A2A" strokeWidth="0.2"/>
                    <line x1="42" y1="178" x2="42" y2="180.5" stroke="#6B4A2A" strokeWidth="0.2"/>
                    <line x1="50" y1="178" x2="50" y2="180.5" stroke="#6B4A2A" strokeWidth="0.2"/>
                    <line x1="20" y1="179.2" x2="60" y2="179.2" stroke="#6B4A2A" strokeWidth="0.2"/>

                    {/* Tiled roof (curved/scalloped tiles) */}
                    <polygon points="14,160 66,160 40,142" fill={roof} stroke="#5C3A2A" strokeWidth="0.5"/>
                    {/* Roof tile rows — scalloped pattern */}
                    {[
                      {y: 158, off: 16},
                      {y: 154, off: 20},
                      {y: 150, off: 24},
                      {y: 146, off: 28},
                    ].map(({y,off},i) => (
                      <g key={i}>
                        {Array.from({length: Math.floor((52-off*2+40)/3)}).map((_,j) => {
                          const cx = (16 + off) + j * 3;
                          if (cx > 64-off) return null;
                          return <path key={j} d={`M ${cx-1},${y} q 1,-1.5 2,0`} stroke={roofDark} strokeWidth="0.3" fill="none"/>;
                        })}
                        <line x1={16+off} y1={y} x2={64-off} y2={y} stroke={roofDark} strokeWidth="0.3" opacity="0.6"/>
                      </g>
                    ))}
                    {/* Roof ridge */}
                    <line x1="40" y1="142" x2="40" y2="160" stroke={roofDark} strokeWidth="0.4" opacity="0.5"/>
                    {/* Eave gable trim */}
                    <line x1="14" y1="160" x2="40" y2="142" stroke={roofDark} strokeWidth="0.5"/>
                    <line x1="40" y1="142" x2="66" y2="160" stroke={roofDark} strokeWidth="0.5"/>

                    {/* Chimney with smoke */}
                    <rect x="48" y="143" width="4" height="6" fill="#A07258" stroke="#6B4A2A" strokeWidth="0.4"/>
                    <rect x="47.5" y="142" width="5" height="1" fill="#7A4F30"/>
                    {h >= 3 && !isHoliday && (
                      <g opacity="0.55">
                        <path d="M 50,141 q -1,-2 0.5,-3 q 1.5,-1 0,-2.5" stroke="#9C9082" strokeWidth="0.5" fill="none" strokeLinecap="round"/>
                        <circle cx="49.5" cy="138" r="0.7" fill="#9C9082" opacity="0.5"/>
                        <circle cx="51" cy="135" r="0.6" fill="#9C9082" opacity="0.4"/>
                      </g>
                    )}

                    {/* Heart-shaped attic vent */}
                    <g transform="translate(40,150)">
                      <path d="M 0,0 q -1,-1.5 -2,0 q -2,-1 -1,1 l 3,2 l 3,-2 q 1,-2 -1,-1 q -1,-1.5 -2,0 Z" fill={trim} stroke="#5C3A2A" strokeWidth="0.25"/>
                    </g>

                    {/* Window left with flower box */}
                    <rect x="24" y="164" width="9" height="8" fill="#A8C5DD" stroke={trim} strokeWidth="0.7"/>
                    <line x1="28.5" y1="164" x2="28.5" y2="172" stroke={trim} strokeWidth="0.5"/>
                    <line x1="24" y1="168" x2="33" y2="168" stroke={trim} strokeWidth="0.5"/>
                    {/* Window curtains */}
                    <rect x="24.5" y="164.5" width="2" height="3" fill="rgba(255,255,255,0.7)"/>
                    <rect x="30.5" y="164.5" width="2" height="3" fill="rgba(255,255,255,0.7)"/>
                    {/* Window sill / flower box */}
                    <rect x="22.5" y="172" width="12" height="2.5" fill="#7A4F30" stroke="#5C3A2A" strokeWidth="0.3"/>
                    {/* Flowers in box */}
                    {h >= 3 && (
                      <g>
                        <circle cx="24" cy="171.5" r="0.7" fill="#E89BB0"/>
                        <circle cx="26" cy="171" r="0.7" fill="#FCEAA8"/>
                        <circle cx="28" cy="171.5" r="0.7" fill="#F5B5C5"/>
                        <circle cx="30" cy="171" r="0.7" fill="#FFFFFF"/>
                        <circle cx="32" cy="171.5" r="0.7" fill="#E89BB0"/>
                        <circle cx="34" cy="171" r="0.7" fill="#FCEAA8"/>
                        {/* Stems */}
                        <line x1="25" y1="172" x2="25" y2="171" stroke="#5C8048" strokeWidth="0.25"/>
                        <line x1="27" y1="172" x2="27" y2="171" stroke="#5C8048" strokeWidth="0.25"/>
                        <line x1="29" y1="172" x2="29" y2="171" stroke="#5C8048" strokeWidth="0.25"/>
                        <line x1="31" y1="172" x2="31" y2="171" stroke="#5C8048" strokeWidth="0.25"/>
                        <line x1="33" y1="172" x2="33" y2="171" stroke="#5C8048" strokeWidth="0.25"/>
                      </g>
                    )}

                    {/* Window right with flower box */}
                    <rect x="47" y="164" width="9" height="8" fill="#A8C5DD" stroke={trim} strokeWidth="0.7"/>
                    <line x1="51.5" y1="164" x2="51.5" y2="172" stroke={trim} strokeWidth="0.5"/>
                    <line x1="47" y1="168" x2="56" y2="168" stroke={trim} strokeWidth="0.5"/>
                    <rect x="47.5" y="164.5" width="2" height="3" fill="rgba(255,255,255,0.7)"/>
                    <rect x="53.5" y="164.5" width="2" height="3" fill="rgba(255,255,255,0.7)"/>
                    <rect x="45.5" y="172" width="12" height="2.5" fill="#7A4F30" stroke="#5C3A2A" strokeWidth="0.3"/>
                    {h >= 3 && (
                      <g>
                        <circle cx="47" cy="171.5" r="0.7" fill="#FCEAA8"/>
                        <circle cx="49" cy="171" r="0.7" fill="#F5B5C5"/>
                        <circle cx="51" cy="171.5" r="0.7" fill="#FFFFFF"/>
                        <circle cx="53" cy="171" r="0.7" fill="#E89BB0"/>
                        <circle cx="55" cy="171.5" r="0.7" fill="#FCEAA8"/>
                        <circle cx="57" cy="171" r="0.7" fill="#F5B5C5"/>
                      </g>
                    )}

                    {/* Door */}
                    <rect x="36" y="170" width="8" height="10" fill={trim} stroke="#5C3A2A" strokeWidth="0.5"/>
                    {/* Door panel detail */}
                    <rect x="37" y="171" width="6" height="3.5" fill={roofDark} opacity="0.3"/>
                    <rect x="37" y="175.5" width="6" height="3.5" fill={roofDark} opacity="0.3"/>
                    {/* Door handle */}
                    <circle cx="42" cy="175" r="0.55" fill="#F5C66C" stroke="#A85420" strokeWidth="0.2"/>
                    {/* Wreath on door (when thriving) */}
                    {h >= 3 && (
                      <g>
                        <circle cx="40" cy="172.5" r="1.2" fill="none" stroke="#5C8048" strokeWidth="0.5"/>
                        <circle cx="38.8" cy="172.5" r="0.3" fill="#7AA85C"/>
                        <circle cx="40" cy="171.3" r="0.3" fill="#7AA85C"/>
                        <circle cx="41.2" cy="172.5" r="0.3" fill="#7AA85C"/>
                        <circle cx="40" cy="173.7" r="0.3" fill="#7AA85C"/>
                        <circle cx="40" cy="170.8" r="0.4" fill="#C84A3F"/>
                      </g>
                    )}
                    {/* Stepping stone at door */}
                    <ellipse cx="40" cy="180.5" rx="3" ry="0.8" fill="#C5B89A" stroke="#A89072" strokeWidth="0.3"/>

                    {/* Bunting strung from gable */}
                    {h >= 3 && (
                      <g>
                        <path d="M 14,160 Q 27,156 40,158 Q 53,156 66,160" stroke="#7A4F30" strokeWidth="0.35" fill="none"/>
                        <polygon points="20,158 22,162 24,158" fill="#F5B5C5" stroke="#7A4F30" strokeWidth="0.2"/>
                        <polygon points="28,157 30,161 32,157" fill="#FCEAA8" stroke="#7A4F30" strokeWidth="0.2"/>
                        <polygon points="38,156 40,160 42,156" fill="#A8C9BB" stroke="#7A4F30" strokeWidth="0.2"/>
                        <polygon points="48,157 50,161 52,157" fill="#E89BB0" stroke="#7A4F30" strokeWidth="0.2"/>
                        <polygon points="56,158 58,162 60,158" fill="#FCEAA8" stroke="#7A4F30" strokeWidth="0.2"/>
                      </g>
                    )}

                    {/* Climbing rose vine on left wall */}
                    {h >= 3 && (
                      <g>
                        <path d="M 19,178 Q 17,170 19,162 Q 17,156 20,150" stroke="#5C8048" strokeWidth="0.5" fill="none"/>
                        <path d="M 19,174 q -2,-1 -2,1 M 19,170 q -2,-1 -2,1 M 19,166 q -2,-1 -2,1" stroke="#5C8048" strokeWidth="0.35" fill="none"/>
                        <ellipse cx="17" cy="176" rx="0.8" ry="0.6" fill="#7AA85C"/>
                        <ellipse cx="17" cy="172" rx="0.8" ry="0.6" fill="#7AA85C"/>
                        <ellipse cx="17" cy="168" rx="0.8" ry="0.6" fill="#7AA85C"/>
                        <ellipse cx="17" cy="164" rx="0.8" ry="0.6" fill="#7AA85C"/>
                        {/* Roses */}
                        <g><circle cx="18" cy="174" r="0.9" fill="#D88AB0"/><circle cx="18" cy="174" r="0.4" fill="#A8567A"/></g>
                        <g><circle cx="19" cy="167" r="0.9" fill="#E89BB0"/><circle cx="19" cy="167" r="0.4" fill="#A8567A"/></g>
                        <g><circle cx="18" cy="161" r="0.9" fill="#D88AB0"/><circle cx="18" cy="161" r="0.4" fill="#A8567A"/></g>
                      </g>
                    )}
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === BENCH (decorative under flowering tree) === */}
            <g filter="url(#softShadow)">
              {/* Tree behind the bench */}
              <g>
                <ellipse cx="103" cy="135" rx="6" ry="7" fill="#5C8048"/>
                <ellipse cx="100" cy="132" rx="3" ry="3" fill="#7AA85C"/>
                <ellipse cx="106" cy="134" rx="2.5" ry="2.5" fill="#7AA85C"/>
                <rect x="102" y="142" width="2" height="3" fill="#6B4F32"/>
                {overall >= 3 && (
                  <g>
                    <circle cx="100" cy="131" r="0.6" fill="#F5B5C5"/>
                    <circle cx="105" cy="133" r="0.6" fill="#F5B5C5"/>
                    <circle cx="103" cy="129" r="0.5" fill="#FCEAA8"/>
                    <circle cx="107" cy="135" r="0.5" fill="#F5B5C5"/>
                  </g>
                )}
              </g>
              {/* Bench */}
              <rect x="92" y="146" width="22" height="2" fill="#8B6F47"/>
              <rect x="92" y="142" width="22" height="1.5" fill="#A6845C"/>
              <rect x="92" y="144" width="22" height="1.5" fill="#A6845C"/>
              <rect x="93" y="148" width="1.5" height="4.5" fill="#6B4F32"/>
              <rect x="111.5" y="148" width="1.5" height="4.5" fill="#6B4F32"/>
              {/* Curved arm rests */}
              <path d="M 92,146 Q 90,143 92,141" stroke="#6B4F32" strokeWidth="0.6" fill="none"/>
              <path d="M 114,146 Q 116,143 114,141" stroke="#6B4F32" strokeWidth="0.6" fill="none"/>
            </g>

            {/* === POND with lily pads & reeds === */}
            <g filter="url(#softShadow)">
              {/* Stones around pond */}
              {[[51,189],[55,186],[61,186],[68,187],[75,189],[78,193],[78,198],[75,202],[68,205],[60,205],[54,202],[51,198]].map(([cx,cy],i) => (
                <ellipse key={i} cx={cx} cy={cy} rx="1.7" ry="0.9" fill="#9C9082" stroke="#6B5C44" strokeWidth="0.2"/>
              ))}
              {/* Water */}
              <ellipse cx="65" cy="195" rx="14" ry="7" fill="url(#pondGrad)"/>
              {/* Water ripples */}
              <ellipse cx="68" cy="193" rx="3" ry="1" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.3"/>
              <ellipse cx="62" cy="197" rx="2.5" ry="0.8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3"/>
              {/* Highlight */}
              <ellipse cx="60" cy="192" rx="5" ry="1.5" fill="white" opacity="0.35"/>
              {/* Lily pads */}
              <g>
                <ellipse cx="68" cy="198" rx="2.8" ry="1.2" fill="#5A8C3F"/>
                <path d="M 68,198 q -1.5,-0.5 -2.5,0" stroke="#3D6B33" strokeWidth="0.25" fill="none"/>
                <circle cx="69" cy="197.5" r="0.7" fill="white"/>
                <circle cx="69" cy="197.5" r="0.3" fill="#FCEAA8"/>
              </g>
              <g>
                <ellipse cx="58" cy="199" rx="2.4" ry="1" fill="#5A8C3F"/>
                <path d="M 58,199 q 1.2,-0.4 2,0" stroke="#3D6B33" strokeWidth="0.25" fill="none"/>
              </g>
              <g>
                <ellipse cx="62" cy="194" rx="1.8" ry="0.8" fill="#5A8C3F"/>
                <circle cx="62.5" cy="193.5" r="0.6" fill="#F5B5C5"/>
                <circle cx="62.5" cy="193.5" r="0.25" fill="#FCEAA8"/>
              </g>
              {/* Reeds at edge */}
              <g>
                <line x1="51" y1="200" x2="51" y2="194" stroke="#5C8048" strokeWidth="0.4"/>
                <line x1="52" y1="200" x2="52" y2="193" stroke="#5C8048" strokeWidth="0.4"/>
                <line x1="53" y1="200" x2="53" y2="195" stroke="#5C8048" strokeWidth="0.4"/>
                <ellipse cx="51" cy="193.5" rx="0.4" ry="0.8" fill="#7A4F30"/>
                <ellipse cx="52" cy="192.5" rx="0.4" ry="0.8" fill="#7A4F30"/>
              </g>
              {/* Frog when thriving */}
              {overall >= 3 && (
                <g transform="translate(68,197.6)">
                  <ellipse cx="0" cy="0" rx="1" ry="0.6" fill="#5C8048"/>
                  <circle cx="-0.4" cy="-0.4" r="0.3" fill="#5C8048"/>
                  <circle cx="0.4" cy="-0.4" r="0.3" fill="#5C8048"/>
                  <circle cx="-0.4" cy="-0.4" r="0.15" fill="#1F1410"/>
                  <circle cx="0.4" cy="-0.4" r="0.15" fill="#1F1410"/>
                </g>
              )}
              {/* Dragonfly when very thriving */}
              {overall >= 4 && (
                <g transform="translate(75,189)">
                  <line x1="0" y1="0" x2="2.5" y2="0" stroke="#3D5C70" strokeWidth="0.4"/>
                  <ellipse cx="0.6" cy="-0.5" rx="1" ry="0.3" fill="#A8C5DD" opacity="0.7"/>
                  <ellipse cx="0.6" cy="0.5" rx="1" ry="0.3" fill="#A8C5DD" opacity="0.7"/>
                  <ellipse cx="1.6" cy="-0.4" rx="0.7" ry="0.25" fill="#A8C5DD" opacity="0.6"/>
                  <ellipse cx="1.6" cy="0.4" rx="0.7" ry="0.25" fill="#A8C5DD" opacity="0.6"/>
                </g>
              )}
            </g>

            {/* === OUTHOUSE (zone) — cottage shed === */}
            <ZoneGroup id="outhouse" health={zoneHealth.outhouse} count={zoneCounts.outhouse}
                       onTap={() => onZoneTap('outhouse')} labelX={165} labelY={211} label="Bathroom">
              {(() => {
                const h = zoneHealth.outhouse;
                const wood = h >= 4 ? '#A6845C' : h >= 3 ? '#967652' : h >= 2 ? '#857058' : '#75695A';
                const woodDark = '#6B4A2A';
                const stone = '#9C8270';
                const roof = h >= 4 ? '#5C3A2A' : '#4A3024';
                return (
                  <g>
                    {/* Stone foundation */}
                    <rect x="148" y="200" width="34" height="8" fill={stone} stroke={woodDark} strokeWidth="0.4"/>
                    {/* Stone block joints */}
                    <line x1="155" y1="200" x2="155" y2="208" stroke={woodDark} strokeWidth="0.3"/>
                    <line x1="165" y1="200" x2="165" y2="208" stroke={woodDark} strokeWidth="0.3"/>
                    <line x1="175" y1="200" x2="175" y2="208" stroke={woodDark} strokeWidth="0.3"/>
                    <line x1="148" y1="204" x2="160" y2="204" stroke={woodDark} strokeWidth="0.3"/>
                    <line x1="170" y1="204" x2="182" y2="204" stroke={woodDark} strokeWidth="0.3"/>
                    {/* Wood weatherboard walls */}
                    <rect x="148" y="180" width="34" height="20" fill={wood} stroke={woodDark} strokeWidth="0.5"/>
                    {/* Horizontal weatherboard lines */}
                    <line x1="148" y1="183" x2="182" y2="183" stroke={woodDark} strokeWidth="0.3" opacity="0.6"/>
                    <line x1="148" y1="186" x2="182" y2="186" stroke={woodDark} strokeWidth="0.3" opacity="0.6"/>
                    <line x1="148" y1="189" x2="182" y2="189" stroke={woodDark} strokeWidth="0.3" opacity="0.6"/>
                    <line x1="148" y1="192" x2="182" y2="192" stroke={woodDark} strokeWidth="0.3" opacity="0.6"/>
                    <line x1="148" y1="195" x2="182" y2="195" stroke={woodDark} strokeWidth="0.3" opacity="0.6"/>
                    <line x1="148" y1="198" x2="182" y2="198" stroke={woodDark} strokeWidth="0.3" opacity="0.6"/>
                    {/* Shingled pitched roof */}
                    <polygon points="144,182 186,182 165,168" fill={roof} stroke="#3D2618" strokeWidth="0.5"/>
                    {/* Shingle rows */}
                    {[173, 177, 181].map((y,i) => {
                      const inset = (181-y) * 1.5;
                      return (
                        <g key={i}>
                          <line x1={144+inset+5} y1={y} x2={186-inset-5} y2={y} stroke="#3D2618" strokeWidth="0.3" opacity="0.6"/>
                          {Array.from({length: 8}).map((_, j) => (
                            <line key={j} x1={150+inset+j*4} y1={y} x2={150+inset+j*4} y2={y+1.5} stroke="#3D2618" strokeWidth="0.2" opacity="0.5"/>
                          ))}
                        </g>
                      );
                    })}
                    {/* Roof finial / chimney pipe */}
                    <rect x="164" y="166" width="2" height="3" fill="#3D2618"/>
                    {/* Door */}
                    <rect x="161" y="190" width="9" height="18" fill={woodDark} stroke="#3D2618" strokeWidth="0.4"/>
                    {/* Door planks */}
                    <line x1="164" y1="190" x2="164" y2="208" stroke="rgba(0,0,0,0.3)" strokeWidth="0.25"/>
                    <line x1="167" y1="190" x2="167" y2="208" stroke="rgba(0,0,0,0.3)" strokeWidth="0.25"/>
                    {/* Iron strapping */}
                    <rect x="161" y="194" width="9" height="0.6" fill="#1F1410"/>
                    <rect x="161" y="203" width="9" height="0.6" fill="#1F1410"/>
                    {/* Crescent moon cutout */}
                    <g>
                      <circle cx="165.5" cy="195" r="1.4" fill="#FFE9A8"/>
                      <circle cx="166.2" cy="194.7" r="1.1" fill={woodDark}/>
                    </g>
                    {/* Door handle */}
                    <circle cx="168.5" cy="201" r="0.55" fill="#F5C66C" stroke="#A85420" strokeWidth="0.2"/>
                    {/* Window */}
                    <rect x="151" y="187" width="6" height="6" fill="#A8C5DD" stroke={woodDark} strokeWidth="0.5"/>
                    <line x1="154" y1="187" x2="154" y2="193" stroke={woodDark} strokeWidth="0.3"/>
                    <line x1="151" y1="190" x2="157" y2="190" stroke={woodDark} strokeWidth="0.3"/>
                    {/* Curtain in window */}
                    <path d="M 151,187 q 0,3 1.5,3 q 1.5,0 1.5,-3 Z" fill="rgba(255,255,255,0.7)"/>
                    {/* Climbing ivy on side */}
                    {h >= 3 && (
                      <g>
                        <path d="M 148,208 Q 146,200 148,192 Q 146,186 149,180" stroke="#3D6B33" strokeWidth="0.4" fill="none"/>
                        <path d="M 150,184 q -2,-1 -3,0 M 150,189 q -2,-1 -3,0 M 150,194 q -2,-1 -3,0 M 150,199 q -2,-1 -3,0 M 150,204 q -2,-1 -3,0" stroke="#3D6B33" strokeWidth="0.3" fill="none"/>
                        {/* Ivy leaves (heart-shaped) */}
                        {[183, 188, 193, 198, 203].map((y,i) => (
                          <g key={i} transform={`translate(146.5,${y})`}>
                            <path d="M 0,0 q -1.2,-1 -1.5,1 q -0.5,1.5 1.5,2 q 2,-0.5 1.5,-2 q -0.3,-2 -1.5,-1 Z" fill="#5C8048" stroke="#3D6B33" strokeWidth="0.15"/>
                          </g>
                        ))}
                      </g>
                    )}
                    {/* Algae streaks when neglected */}
                    {h <= 2 && (
                      <g opacity="0.55">
                        <path d="M 148,194 Q 152,192 156,196 Q 160,194 164,198" stroke="#5C7A3F" strokeWidth="0.6" fill="none"/>
                        <path d="M 170,196 Q 174,193 178,196 Q 181,195 184,198" stroke="#5C7A3F" strokeWidth="0.5" fill="none"/>
                      </g>
                    )}
                    {/* Small flower at foundation */}
                    {h >= 3 && (
                      <g>
                        <ellipse cx="180" cy="207" rx="1.5" ry="0.6" fill="#5C8048"/>
                        <circle cx="179" cy="206" r="0.5" fill="#F5B5C5"/>
                        <circle cx="181" cy="206" r="0.4" fill="#FCEAA8"/>
                      </g>
                    )}
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === SIT-ON LAWNMOWER (zone) — with character === */}
            <ZoneGroup id="mower" health={zoneHealth.mower} count={zoneCounts.mower}
                       onTap={() => onZoneTap('mower')} labelX={141} labelY={246} label="Mower">
              {(() => {
                const h = zoneHealth.mower;
                const red    = h >= 4 ? '#C84A3F' : h >= 3 ? '#B04438' : h >= 2 ? '#955F4A' : '#7E6E62';
                const dark   = h >= 4 ? '#9C3528' : h >= 3 ? '#86301E' : '#754A36';
                const yellow = '#FFCB3F';
                return (
                  <g>
                    {/* Shadow */}
                    <ellipse cx="141" cy="246" rx="20" ry="2" fill="rgba(0,0,0,0.2)"/>
                    {/* Cutting deck (front) */}
                    <rect x="121" y="234" width="20" height="6" rx="1" fill={dark} stroke="#3D2A1F" strokeWidth="0.4"/>
                    <line x1="124" y1="237" x2="138" y2="237" stroke="#1F1410" strokeWidth="0.3"/>
                    {/* Grass clippings sticking out */}
                    {h >= 3 && (
                      <g>
                        <path d="M 122,234 q -1,-1.5 -0.5,-2.5 M 124,234 q -0.8,-1.8 0,-2.5 M 138,234 q 1,-1.5 0.5,-2.5" stroke="#5C8048" strokeWidth="0.4" fill="none"/>
                      </g>
                    )}
                    {/* Main body */}
                    <rect x="125" y="225" width="32" height="11" rx="2" fill={red} stroke={dark} strokeWidth="0.6"/>
                    {/* Body highlight */}
                    <rect x="126" y="226" width="30" height="2" fill="rgba(255,255,255,0.2)"/>
                    {/* Hood scoop */}
                    <rect x="146" y="221" width="11" height="7" rx="1.5" fill={red} stroke={dark} strokeWidth="0.6"/>
                    <rect x="147" y="222" width="9" height="1" fill="rgba(255,255,255,0.2)"/>
                    {/* Headlights */}
                    <circle cx="156.5" cy="225" r="1" fill={yellow} stroke={dark} strokeWidth="0.3"/>
                    <circle cx="156.5" cy="225" r="0.5" fill="#FFF5D4"/>
                    {/* Engine bolts visible */}
                    <circle cx="148" cy="225" r="0.3" fill="#1F1410"/>
                    <circle cx="152" cy="225" r="0.3" fill="#1F1410"/>
                    {/* Seat */}
                    <rect x="129" y="217" width="9" height="7" rx="1" fill="#3D2A1F" stroke="#1A1208" strokeWidth="0.4"/>
                    <rect x="129" y="223" width="9" height="2" fill="#1F1410"/>
                    {/* Seat highlight */}
                    <rect x="130" y="218" width="7" height="1.5" fill="rgba(255,255,255,0.15)"/>
                    {/* Steering column */}
                    <line x1="143" y1="227" x2="143" y2="220" stroke="#3D2A1F" strokeWidth="0.9"/>
                    {/* Steering wheel */}
                    <ellipse cx="143" cy="219" rx="2.5" ry="1.2" fill="none" stroke="#3D2A1F" strokeWidth="0.8"/>
                    <line x1="140.5" y1="219" x2="145.5" y2="219" stroke="#3D2A1F" strokeWidth="0.4"/>
                    <line x1="143" y1="217.8" x2="143" y2="220.2" stroke="#3D2A1F" strokeWidth="0.4"/>
                    {/* Wheels */}
                    <circle cx="131" cy="241" r="4" fill="#2C2018" stroke="#1A1208" strokeWidth="0.5"/>
                    <circle cx="131" cy="241" r="1.5" fill="#7A6D60"/>
                    <circle cx="131" cy="241" r="0.5" fill="#3D2A1F"/>
                    {/* Wheel treads */}
                    {[0,45,90,135,180,225,270,315].map(a => {
                      const rad = a * Math.PI / 180;
                      return <line key={a} x1={131 + Math.cos(rad)*3} y1={241 + Math.sin(rad)*3} x2={131 + Math.cos(rad)*3.8} y2={241 + Math.sin(rad)*3.8} stroke="#1A1208" strokeWidth="0.4"/>;
                    })}
                    <circle cx="151" cy="241" r="4" fill="#2C2018" stroke="#1A1208" strokeWidth="0.5"/>
                    <circle cx="151" cy="241" r="1.5" fill="#7A6D60"/>
                    <circle cx="151" cy="241" r="0.5" fill="#3D2A1F"/>
                    {[0,45,90,135,180,225,270,315].map(a => {
                      const rad = a * Math.PI / 180;
                      return <line key={a} x1={151 + Math.cos(rad)*3} y1={241 + Math.sin(rad)*3} x2={151 + Math.cos(rad)*3.8} y2={241 + Math.sin(rad)*3.8} stroke="#1A1208" strokeWidth="0.4"/>;
                    })}
                    {/* Exhaust pipe */}
                    <rect x="156" y="230" width="2" height="1.5" fill="#5C5044" stroke="#1F1410" strokeWidth="0.2"/>
                    {/* Side number/decal */}
                    <circle cx="135" cy="231" r="1.5" fill="white" stroke={dark} strokeWidth="0.3"/>
                    <text x="135" y="232.2" fontSize="2" fill={dark} textAnchor="middle" style={{fontFamily:'Quicksand,sans-serif',fontWeight:700}}>H</text>
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === HERB GARDEN (zone) — proper raised bed === */}
            <ZoneGroup id="herb-garden" health={zoneHealth['herb-garden']} count={zoneCounts['herb-garden']}
                       onTap={() => onZoneTap('herb-garden')} labelX={32} labelY={237} label="Kitchen">
              {(() => {
                const h = zoneHealth['herb-garden'];
                const green1 = h >= 4 ? '#5C8048' : h >= 3 ? '#6E8C56' : '#8C9265';
                const green2 = h >= 4 ? '#7AA85C' : h >= 3 ? '#85A062' : '#9CA478';
                const green3 = h >= 4 ? '#94BC68' : h >= 3 ? '#9CB078' : '#A8AC80';
                return (
                  <g>
                    {/* Wooden raised bed (front face) */}
                    <rect x="8" y="220" width="48" height="14" fill="#A6845C" stroke="#7A5F3D" strokeWidth="0.5"/>
                    {/* Top edge */}
                    <rect x="8" y="219" width="48" height="2" fill="#C4A37A" stroke="#7A5F3D" strokeWidth="0.3"/>
                    {/* Plank lines (horizontal) */}
                    <line x1="8" y1="223" x2="56" y2="223" stroke="#7A5F3D" strokeWidth="0.3" opacity="0.6"/>
                    <line x1="8" y1="227" x2="56" y2="227" stroke="#7A5F3D" strokeWidth="0.3" opacity="0.6"/>
                    <line x1="8" y1="231" x2="56" y2="231" stroke="#7A5F3D" strokeWidth="0.3" opacity="0.6"/>
                    {/* Corner posts */}
                    <rect x="7" y="219" width="2" height="15" fill="#7A5F3D"/>
                    <rect x="55" y="219" width="2" height="15" fill="#7A5F3D"/>
                    {/* Soil bed top */}
                    <rect x="9" y="219.5" width="46" height="2" fill="#4A3024"/>
                    {/* Herbs differentiated */}
                    {/* Rosemary - tall narrow spike */}
                    <g>
                      <line x1="13" y1="220" x2="13" y2="216" stroke={green1} strokeWidth="0.7"/>
                      <line x1="14" y1="220" x2="14" y2="217" stroke={green1} strokeWidth="0.7"/>
                      <line x1="12" y1="220" x2="12" y2="217.5" stroke={green1} strokeWidth="0.6"/>
                      {[216, 217, 218, 219].map((y,i) => (
                        <g key={i}>
                          <line x1="11.5" y1={y} x2="14.5" y2={y} stroke={green2} strokeWidth="0.3"/>
                        </g>
                      ))}
                    </g>
                    {/* Basil - bushy round */}
                    <ellipse cx="22" cy="219" rx="3" ry="2.3" fill={green1}/>
                    <ellipse cx="21" cy="218" rx="1.5" ry="1.5" fill={green2}/>
                    <ellipse cx="23" cy="218.5" rx="1.2" ry="1.3" fill={green3}/>
                    {/* Lavender - tall purple spike */}
                    <g>
                      <line x1="30" y1="220" x2="30" y2="215" stroke={green1} strokeWidth="0.5"/>
                      <line x1="31" y1="220" x2="31" y2="216" stroke={green1} strokeWidth="0.5"/>
                      <line x1="32" y1="220" x2="32" y2="215.5" stroke={green1} strokeWidth="0.5"/>
                      {h >= 3 && (
                        <g>
                          <ellipse cx="30" cy="215" rx="0.4" ry="1.3" fill="#A88AB0"/>
                          <ellipse cx="31" cy="215.5" rx="0.4" ry="1.4" fill="#A88AB0"/>
                          <ellipse cx="32" cy="215" rx="0.4" ry="1.3" fill="#A88AB0"/>
                        </g>
                      )}
                    </g>
                    {/* Mint - varied shape leaves */}
                    <ellipse cx="40" cy="219" rx="2.5" ry="2" fill={green2}/>
                    <ellipse cx="39" cy="218" rx="1.2" ry="1.5" fill={green1}/>
                    <ellipse cx="41" cy="218" rx="1" ry="1.3" fill={green3}/>
                    {/* Chives - thin tall */}
                    <g>
                      <line x1="48" y1="220" x2="48" y2="215" stroke={green2} strokeWidth="0.4"/>
                      <line x1="49" y1="220" x2="49" y2="214.5" stroke={green2} strokeWidth="0.4"/>
                      <line x1="50" y1="220" x2="50" y2="215" stroke={green2} strokeWidth="0.4"/>
                      <line x1="51" y1="220" x2="51" y2="215.5" stroke={green2} strokeWidth="0.4"/>
                      {h >= 3 && (
                        <g>
                          <circle cx="48" cy="214.5" r="0.6" fill="#B894C0"/>
                          <circle cx="50" cy="214.5" r="0.5" fill="#B894C0"/>
                        </g>
                      )}
                    </g>
                    {/* Wooden plant labels */}
                    <g>
                      <rect x="13" y="222" width="2" height="1.2" fill="#FFFAEB" stroke="#7A5F3D" strokeWidth="0.15"/>
                      <line x1="14" y1="223" x2="14" y2="225" stroke="#7A5F3D" strokeWidth="0.2"/>
                      <rect x="29" y="222" width="2" height="1.2" fill="#FFFAEB" stroke="#7A5F3D" strokeWidth="0.15"/>
                      <line x1="30" y1="223" x2="30" y2="225" stroke="#7A5F3D" strokeWidth="0.2"/>
                      <rect x="48" y="222" width="2" height="1.2" fill="#FFFAEB" stroke="#7A5F3D" strokeWidth="0.15"/>
                      <line x1="49" y1="223" x2="49" y2="225" stroke="#7A5F3D" strokeWidth="0.2"/>
                    </g>
                    {/* Trowel resting on edge */}
                    <g transform="translate(53,217.5) rotate(15)">
                      <path d="M 0,0 q 1.5,-0.5 1.5,2 q 0,2 -1.5,2 q -1.5,0 -1.5,-2 q 0,-2.5 1.5,-2 Z" fill="#9C9082" stroke="#5C5044" strokeWidth="0.2"/>
                      <rect x="-0.4" y="3.5" width="0.8" height="3" fill="#7A4F30"/>
                    </g>
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === LAWN (zone — invisible click area on grass) === */}
            <ZoneGroup id="lawn" health={zoneHealth.lawn} count={zoneCounts.lawn}
                       onTap={() => onZoneTap('lawn')} labelX={130} labelY={170} label="Lawn">
              <rect x="105" y="185" width="40" height="22" fill="transparent"/>
              <g opacity={zoneHealth.lawn >= 3 ? 0.18 : 0.08}>
                <line x1="108" y1="190" x2="142" y2="190" stroke="#5A8035" strokeWidth="0.6"/>
                <line x1="108" y1="195" x2="142" y2="195" stroke="#5A8035" strokeWidth="0.6"/>
                <line x1="108" y1="200" x2="142" y2="200" stroke="#5A8035" strokeWidth="0.6"/>
              </g>
            </ZoneGroup>

            {/* === PUMPKIN PATCH (zone) — autumn corner === */}
            <ZoneGroup id="pumpkin-patch" health={zoneHealth['pumpkin-patch']} count={zoneCounts['pumpkin-patch']}
                       onTap={() => onZoneTap('pumpkin-patch')} labelX={78} labelY={216} label="Pumpkins">
              {(() => {
                const h = zoneHealth['pumpkin-patch'];
                const pumpkin = h >= 4 ? '#E68B3F' : h >= 3 ? '#C97D3A' : h >= 2 ? '#A87740' : '#8A7558';
                const pumpkinDark = h >= 4 ? '#A85420' : h >= 3 ? '#8E4818' : '#6E3E18';
                const stem = '#5C7A3F';
                return (
                  <g>
                    {/* Soil patch */}
                    <ellipse cx="78" cy="225" rx="20" ry="4" fill="#6B4F32"/>
                    <ellipse cx="78" cy="224.2" rx="20" ry="3.7" fill="#7E5C3D"/>
                    {/* Spreading vines on ground */}
                    {h >= 3 && (
                      <g stroke={stem} strokeWidth="0.4" fill="none" opacity="0.85">
                        <path d="M 78,224 Q 84,222 90,225 Q 94,224 96,227"/>
                        <path d="M 78,224 Q 72,222 66,225 Q 62,223 60,225"/>
                        <path d="M 78,224 Q 80,221 84,220 Q 86,219 88,221"/>
                        {/* Curly tendrils */}
                        <path d="M 96,227 q 1,-1 0,-2 q -1,-1 0,-1.5"/>
                        <path d="M 60,225 q -1,-1 0,-2 q 1,-1 0,-1.5"/>
                      </g>
                    )}
                    {/* Spreading leaves */}
                    {h >= 3 && (
                      <g>
                        <path d="M 86,221 q 1.5,-1 3,0 q 1,1.5 -1,2 q -2,0.5 -2,-2 Z" fill="#5C8048" stroke={stem} strokeWidth="0.2"/>
                        <path d="M 68,223 q -1.5,-1 -3,0 q -1,1.5 1,2 q 2,0.5 2,-2 Z" fill="#5C8048" stroke={stem} strokeWidth="0.2"/>
                        <path d="M 92,226 q 1,-0.5 2,0 q 0.5,1 -0.5,1.3 q -1.5,0.3 -1.5,-1.3 Z" fill="#6E9054" stroke={stem} strokeWidth="0.2"/>
                      </g>
                    )}
                    {/* Pumpkin 1 (small left) */}
                    <g>
                      <ellipse cx="65" cy="222" rx="3.5" ry="3" fill={pumpkin}/>
                      <ellipse cx="64" cy="221.5" rx="1.2" ry="2.5" fill={pumpkinDark} opacity="0.4"/>
                      <ellipse cx="66" cy="221.5" rx="1.2" ry="2.5" fill={pumpkinDark} opacity="0.4"/>
                      <path d="M 62,222 Q 63,219.5 65,219.5 M 68,222 Q 67,219.5 65,219.5" stroke={pumpkinDark} strokeWidth="0.4" fill="none"/>
                      <path d="M 65,219.5 Q 64,218 63,218.5" stroke={stem} strokeWidth="0.6" fill="none" strokeLinecap="round"/>
                      {/* Highlight */}
                      <ellipse cx="63.5" cy="220.5" rx="0.6" ry="1" fill="rgba(255,255,255,0.2)"/>
                    </g>
                    {/* Pumpkin 2 (large center) */}
                    <g>
                      <ellipse cx="78" cy="222" rx="5" ry="4" fill={pumpkin}/>
                      <ellipse cx="76" cy="221" rx="1.4" ry="3.2" fill={pumpkinDark} opacity="0.4"/>
                      <ellipse cx="78" cy="221" rx="1.4" ry="3.2" fill={pumpkinDark} opacity="0.3"/>
                      <ellipse cx="80" cy="221" rx="1.4" ry="3.2" fill={pumpkinDark} opacity="0.4"/>
                      <path d="M 74,222 Q 75,218.5 78,218.5 M 82,222 Q 81,218.5 78,218.5" stroke={pumpkinDark} strokeWidth="0.4" fill="none"/>
                      <path d="M 78,218.5 Q 77,217 76,217.5" stroke={stem} strokeWidth="0.6" fill="none" strokeLinecap="round"/>
                      <ellipse cx="76" cy="220" rx="0.7" ry="1.2" fill="rgba(255,255,255,0.18)"/>
                    </g>
                    {/* Pumpkin 3 (medium right) */}
                    <g>
                      <ellipse cx="89" cy="223" rx="4" ry="3.2" fill={pumpkin}/>
                      <ellipse cx="88" cy="222" rx="1.2" ry="2.5" fill={pumpkinDark} opacity="0.4"/>
                      <ellipse cx="90" cy="222" rx="1.2" ry="2.5" fill={pumpkinDark} opacity="0.4"/>
                      <path d="M 86,223 Q 87,220 89,220 M 92,223 Q 91,220 89,220" stroke={pumpkinDark} strokeWidth="0.4" fill="none"/>
                      <path d="M 89,220 Q 88,218.5 87,219" stroke={stem} strokeWidth="0.6" fill="none" strokeLinecap="round"/>
                      <ellipse cx="87.5" cy="221.5" rx="0.5" ry="0.9" fill="rgba(255,255,255,0.18)"/>
                    </g>
                    {/* Yellow blossom (unopened pumpkin) */}
                    {h >= 3 && (
                      <g>
                        <line x1="96" y1="226" x2="98" y2="223" stroke={stem} strokeWidth="0.4"/>
                        <ellipse cx="98" cy="223" rx="1.2" ry="1.4" fill="#FCEAA8" stroke={pumpkinDark} strokeWidth="0.2"/>
                        <ellipse cx="98" cy="223" rx="0.4" ry="0.8" fill="#F5C66C"/>
                      </g>
                    )}
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === PATIO (zone) — proper stone slabs === */}
            <ZoneGroup id="patio" health={zoneHealth.patio} count={zoneCounts.patio}
                       onTap={() => onZoneTap('patio')} labelX={100} labelY={278} label="Patio">
              {(() => {
                const h = zoneHealth.patio;
                const stone = h >= 4 ? '#D6CBB0' : h >= 3 ? '#C4B89C' : h >= 2 ? '#B0A689' : '#9C9682';
                const stoneEdge = h >= 4 ? '#A89875' : h >= 3 ? '#967E5E' : '#7E6E54';
                return (
                  <g>
                    {/* Patio area */}
                    <polygon points="62,250 138,250 148,278 52,278" fill={stone} stroke={stoneEdge} strokeWidth="0.7"/>
                    {/* Stone slab joints — irregular pattern */}
                    <line x1="78" y1="250" x2="72" y2="278" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="92" y1="250" x2="88" y2="262" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="108" y1="250" x2="112" y2="262" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="122" y1="250" x2="128" y2="278" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="58" y1="262" x2="142" y2="262" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="88" y1="262" x2="92" y2="278" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="112" y1="262" x2="108" y2="278" stroke={stoneEdge} strokeWidth="0.5" opacity="0.6"/>
                    <line x1="55" y1="270" x2="145" y2="270" stroke={stoneEdge} strokeWidth="0.4" opacity="0.5"/>
                    {/* Subtle stone shading texture */}
                    {[[68,257],[82,260],[103,256],[120,258],[136,260],[75,272],[100,272],[125,274]].map(([cx,cy],i) => (
                      <ellipse key={i} cx={cx} cy={cy} rx="2" ry="0.7" fill={stoneEdge} opacity="0.15"/>
                    ))}
                    {/* Fallen leaves when neglected */}
                    {h <= 2 && (
                      <g opacity="0.7">
                        <ellipse cx="75" cy="258" rx="1.5" ry="0.8" fill="#A88040" transform="rotate(20 75 258)"/>
                        <ellipse cx="115" cy="265" rx="1.5" ry="0.8" fill="#8E6B30" transform="rotate(-15 115 265)"/>
                        <ellipse cx="95" cy="270" rx="1.2" ry="0.6" fill="#A88040"/>
                        <ellipse cx="125" cy="252" rx="1.2" ry="0.6" fill="#8E6B30" transform="rotate(40 125 252)"/>
                      </g>
                    )}
                    {/* Plant pots on patio */}
                    {h >= 3 && (
                      <g>
                        <g>
                          <path d="M 58,266 q 0,-3 5,-3 q 5,0 5,3 l -0.8,4 q 0,1 -4.2,1 q -4.2,0 -4.2,-1 Z" fill="#B85F3F" stroke="#7A4528" strokeWidth="0.3"/>
                          <ellipse cx="63" cy="263" rx="2.5" ry="0.7" fill="#7A4528"/>
                          <ellipse cx="63" cy="262" rx="2.5" ry="1.5" fill="#5C8048"/>
                          <ellipse cx="62" cy="261" rx="1" ry="1.5" fill="#7AA85C"/>
                          {h >= 4 && <circle cx="63" cy="260.5" r="0.6" fill="#F5B5C5"/>}
                        </g>
                        <g>
                          <path d="M 132,266 q 0,-3 5,-3 q 5,0 5,3 l -0.8,4 q 0,1 -4.2,1 q -4.2,0 -4.2,-1 Z" fill="#B85F3F" stroke="#7A4528" strokeWidth="0.3"/>
                          <ellipse cx="137" cy="263" rx="2.5" ry="0.7" fill="#7A4528"/>
                          <ellipse cx="137" cy="262" rx="2.5" ry="1.5" fill="#5C8048"/>
                          <ellipse cx="138" cy="261" rx="1" ry="1.5" fill="#7AA85C"/>
                          {h >= 4 && <circle cx="137" cy="260.5" r="0.6" fill="#FCEAA8"/>}
                        </g>
                      </g>
                    )}
                    {showCouple ? (
                      <g>
                        <text x="85" y="262" fontSize="9">👫</text>
                        <text x="105" y="263" fontSize="6">🍷</text>
                      </g>
                    ) : (
                      <g>
                        {/* Patio table & chairs */}
                        <g>
                          <ellipse cx="100" cy="259" rx="6" ry="2" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.3"/>
                          <ellipse cx="100" cy="258.5" rx="5.5" ry="1.5" fill="#A6845C"/>
                          <rect x="99" y="259" width="2" height="5" fill="#5C5044"/>
                          <ellipse cx="100" cy="264" rx="3" ry="0.8" fill="#5C5044"/>
                          {/* Chair left */}
                          <rect x="91" y="258" width="3.5" height="3" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.3"/>
                          <rect x="91" y="255" width="3.5" height="3" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.3"/>
                          {h >= 3 && <rect x="91.5" y="256" width="2.5" height="1" fill="#E89BB0"/>}
                          {/* Chair right */}
                          <rect x="105.5" y="258" width="3.5" height="3" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.3"/>
                          <rect x="105.5" y="255" width="3.5" height="3" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.3"/>
                          {h >= 3 && <rect x="106" y="256" width="2.5" height="1" fill="#A8C9BB"/>}
                          {/* Tea cup on table */}
                          {h >= 3 && (
                            <g>
                              <ellipse cx="100" cy="257.5" rx="0.8" ry="0.4" fill="white" stroke="#5C5044" strokeWidth="0.2"/>
                              <path d="M 100.6,257.5 q 0.5,0 0.5,0.5 q 0,0.3 -0.4,0.3" stroke="#5C5044" strokeWidth="0.2" fill="none"/>
                            </g>
                          )}
                        </g>
                      </g>
                    )}
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === SUN LOUNGER (zone) — bedroom === */}
            <ZoneGroup id="sun-lounger" health={zoneHealth['sun-lounger']} count={zoneCounts['sun-lounger']}
                       onTap={() => onZoneTap('sun-lounger')} labelX={22} labelY={266} label="Bedroom">
              {(() => {
                const h = zoneHealth['sun-lounger'];
                const stripe1 = h >= 4 ? '#F5C896' : h >= 3 ? '#DEB888' : h >= 2 ? '#C4AC8C' : '#AAA290';
                const stripe2 = h >= 4 ? '#FFFAEB' : h >= 3 ? '#EFE8D6' : h >= 2 ? '#D8D2C0' : '#BCB8AC';
                return (
                  <g>
                    {/* Lounger frame */}
                    <rect x="6" y="258" width="38" height="4" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.5"/>
                    {/* Striped cushion */}
                    <rect x="8" y="254" width="6" height="6" fill={stripe1}/>
                    <rect x="14" y="254" width="6" height="6" fill={stripe2}/>
                    <rect x="20" y="254" width="6" height="6" fill={stripe1}/>
                    <rect x="26" y="254" width="6" height="6" fill={stripe2}/>
                    <rect x="32" y="254" width="6" height="6" fill={stripe1}/>
                    <rect x="38" y="254" width="4" height="6" fill={stripe2}/>
                    {/* Cushion stitching */}
                    <line x1="7" y1="257" x2="42" y2="257" stroke="rgba(60,40,20,0.15)" strokeWidth="0.2"/>
                    {/* Headrest */}
                    <rect x="38" y="249" width="6" height="9" fill={stripe1} stroke="#5C5044" strokeWidth="0.4"/>
                    <line x1="39" y1="251" x2="43" y2="251" stroke="rgba(60,40,20,0.15)" strokeWidth="0.2"/>
                    <line x1="39" y1="254" x2="43" y2="254" stroke="rgba(60,40,20,0.15)" strokeWidth="0.2"/>
                    {/* Legs */}
                    <rect x="8" y="262" width="1.5" height="3" fill="#5C5044"/>
                    <rect x="40" y="262" width="1.5" height="3" fill="#5C5044"/>
                    {/* Pillow with character */}
                    {h >= 4 && (
                      <g>
                        <rect x="22" y="252.5" width="4" height="2" rx="0.5" fill="#9C5642" stroke="#5C5044" strokeWidth="0.2"/>
                        <line x1="22.5" y1="253.5" x2="25.5" y2="253.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.15"/>
                      </g>
                    )}
                    {/* Sun hat hanging on backrest */}
                    {h >= 3 && (
                      <g>
                        <ellipse cx="40" cy="252" rx="3" ry="0.6" fill="#D6CBB0" stroke="#7A5F3D" strokeWidth="0.2"/>
                        <ellipse cx="40" cy="251" rx="1.5" ry="0.8" fill="#D6CBB0" stroke="#7A5F3D" strokeWidth="0.2"/>
                        {/* Hat band */}
                        <ellipse cx="40" cy="251.5" rx="1.5" ry="0.3" fill="#9C5642"/>
                      </g>
                    )}
                    {/* Side table with drink */}
                    {h >= 3 && (
                      <g>
                        <rect x="2" y="262" width="3.5" height="3" fill="#7A6E5C" stroke="#5C5044" strokeWidth="0.3"/>
                        <rect x="3" y="262.5" width="1.5" height="0.8" fill="rgba(255,255,255,0.15)"/>
                        <rect x="2.5" y="265" width="0.5" height="2" fill="#5C5044"/>
                        <rect x="4.5" y="265" width="0.5" height="2" fill="#5C5044"/>
                        {/* Glass with lemonade */}
                        <rect x="3" y="259.5" width="1.5" height="2.5" fill="rgba(252,234,168,0.85)" stroke="#7A5F3D" strokeWidth="0.15"/>
                        <ellipse cx="3.75" cy="259.5" rx="0.75" ry="0.2" fill="#FCEAA8" stroke="#7A5F3D" strokeWidth="0.1"/>
                        <line x1="4" y1="259" x2="4" y2="262" stroke="#A85420" strokeWidth="0.1"/>
                      </g>
                    )}
                    {/* Open book on lounger */}
                    {h >= 3 && (
                      <g transform="translate(28,253)">
                        <path d="M 0,0 q -1.5,-1 -2.5,0 q 1,0.5 1,2 q 1.5,-1 2.5,0 q 1,-1 2.5,0 q 0,-1.5 1,-2 q -1,-1 -2.5,0 Z" fill="white" stroke="#5C5044" strokeWidth="0.2"/>
                        <line x1="0" y1="0" x2="0" y2="2" stroke="#5C5044" strokeWidth="0.15"/>
                      </g>
                    )}
                  </g>
                );
              })()}
            </ZoneGroup>

            {/* === BIRD TABLE === */}
            <g filter="url(#softShadow)">
              {/* Pole */}
              <rect x="170" y="240" width="2" height="22" fill="#8B6F47" stroke="#5C3A2A" strokeWidth="0.2"/>
              {/* Roof */}
              <polygon points="161,240 181,240 171,232" fill="#A6845C" stroke="#5C3A2A" strokeWidth="0.4"/>
              {/* Roof shingle texture */}
              <line x1="164" y1="237" x2="178" y2="237" stroke="#5C3A2A" strokeWidth="0.2" opacity="0.5"/>
              <line x1="167" y1="234" x2="175" y2="234" stroke="#5C3A2A" strokeWidth="0.2" opacity="0.5"/>
              {/* Floor */}
              <rect x="163" y="238" width="16" height="3" fill="#A6845C" stroke="#5C3A2A" strokeWidth="0.3"/>
              <line x1="166" y1="238.5" x2="176" y2="238.5" stroke="#5C3A2A" strokeWidth="0.15" opacity="0.5"/>
              {/* Birds */}
              {!isHoliday && (
                <g>
                  {/* Bird 1 - sparrow */}
                  <ellipse cx="167" cy="237.2" rx="1.3" ry="0.9" fill="#7A5F3D" stroke="#3D2618" strokeWidth="0.15"/>
                  <circle cx="166" cy="236.5" r="0.7" fill="#A88160"/>
                  <circle cx="165.7" cy="236.4" r="0.18" fill="#1F1410"/>
                  <path d="M 165.3,236.7 l -0.5,0.1 l 0.4,0.1 Z" fill="#F5C66C"/>
                  {/* Bird 2 - robin (when thriving) */}
                  {overall >= 3 && (
                    <g>
                      <ellipse cx="174" cy="237.2" rx="1.3" ry="0.9" fill="#5C8048"/>
                      <ellipse cx="174.3" cy="237.4" rx="0.8" ry="0.5" fill="#C84A3F"/>
                      <circle cx="173" cy="236.5" r="0.7" fill="#5C8048"/>
                      <circle cx="172.7" cy="236.4" r="0.18" fill="#1F1410"/>
                      <path d="M 172.3,236.7 l -0.5,0.1 l 0.4,0.1 Z" fill="#3D2618"/>
                    </g>
                  )}
                  {/* Seeds scattered */}
                  <circle cx="170" cy="240" r="0.2" fill="#7A5F3D"/>
                  <circle cx="171" cy="240.3" r="0.2" fill="#A85420"/>
                  <circle cx="173" cy="240.2" r="0.2" fill="#7A5F3D"/>
                </g>
              )}
              {/* Hanging seed feeder */}
              {overall >= 4 && (
                <g>
                  <line x1="165" y1="232" x2="165" y2="240" stroke="#5C3A2A" strokeWidth="0.2"/>
                  <rect x="163.5" y="240" width="3" height="3" fill="#A8C5DD" opacity="0.7" stroke="#5C3A2A" strokeWidth="0.2"/>
                  <line x1="163.5" y1="241.5" x2="166.5" y2="241.5" stroke="#5C3A2A" strokeWidth="0.15"/>
                </g>
              )}
            </g>

            {/* === SUNFLOWERS along right edge === */}
            {[140, 158, 176, 194].map((y, i) => {
              const c = overall >= 3 ? '#FFCB3F' : '#C4A848';
              const cs = overall >= 3 ? '#5C8048' : '#7A8556';
              const cd = overall >= 3 ? '#E8A93F' : '#A88840';
              return (
                <g key={`sf-${i}`}>
                  {/* Stem */}
                  <line x1={194} y1={y} x2={194} y2={y - 9} stroke={cs} strokeWidth="0.8"/>
                  {/* Leaves */}
                  <path d={`M 194,${y-3} q -3,-1 -4,1 q 0,2 2,2 q 1.5,0 2,-3 Z`} fill={cs} stroke="#3D6B33" strokeWidth="0.2"/>
                  <path d={`M 194,${y-6} q 3,-1 4,1 q 0,2 -2,2 q -1.5,0 -2,-3 Z`} fill={cs} stroke="#3D6B33" strokeWidth="0.2"/>
                  {/* Petal layer back */}
                  {[0,30,60,90,120,150,180,210,240,270,300,330].map(angle => {
                    const rad = angle * Math.PI / 180;
                    const x1 = 194 + Math.cos(rad) * 1.5;
                    const y1 = (y - 11) + Math.sin(rad) * 1.5;
                    const x2 = 194 + Math.cos(rad) * 4;
                    const y2 = (y - 11) + Math.sin(rad) * 4;
                    return <ellipse key={angle} cx={(x1+x2)/2} cy={(y1+y2)/2} rx="1.4" ry="0.6" fill={c} stroke={cd} strokeWidth="0.2" transform={`rotate(${angle} ${(x1+x2)/2} ${(y1+y2)/2})`}/>;
                  })}
                  {/* Center */}
                  <circle cx={194} cy={y - 11} r="2.5" fill="#5C3A1F"/>
                  <circle cx={194} cy={y - 11} r="1.8" fill="#7A4D2A"/>
                  {/* Seeds */}
                  {[[193,y-12],[195,y-11.5],[193.5,y-10],[195,y-10.5],[194,y-11]].map(([cx,cy],j) => (
                    <circle key={j} cx={cx} cy={cy} r="0.25" fill="#3D2A18"/>
                  ))}
                </g>
              );
            })}

            {/* === SWIFTS === */}
            {showSwifts && (
              <g fill="#3D2A1F">
                <text x="50" y="50" fontSize="6" style={{animation: 'swift 8s linear infinite'}}>𓅪</text>
                <text x="120" y="65" fontSize="6" style={{animation: 'swift 10s linear infinite reverse'}}>𓅪</text>
                <text x="80" y="45" fontSize="5" style={{animation: 'swift 12s linear infinite'}}>𓅪</text>
              </g>
            )}

            {/* === BUTTERFLIES === */}
            {showButterflies && (
              <g>
                <g transform="translate(60,160)">
                  <ellipse cx="-1.2" cy="-0.5" rx="1.5" ry="1.3" fill="#E89BB0" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="-1.2" cy="0.6" rx="1.2" ry="1" fill="#F5B5C5" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="1.2" cy="-0.5" rx="1.5" ry="1.3" fill="#E89BB0" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="1.2" cy="0.6" rx="1.2" ry="1" fill="#F5B5C5" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="0" cy="0" rx="0.3" ry="1.2" fill="#3D2A1F"/>
                </g>
                <g transform="translate(155,165)">
                  <ellipse cx="-1.2" cy="-0.5" rx="1.4" ry="1.2" fill="#FCEAA8" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="-1.2" cy="0.6" rx="1.1" ry="0.9" fill="#FFE9A8" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="1.2" cy="-0.5" rx="1.4" ry="1.2" fill="#FCEAA8" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="1.2" cy="0.6" rx="1.1" ry="0.9" fill="#FFE9A8" stroke="#A85420" strokeWidth="0.2"/>
                  <ellipse cx="0" cy="0" rx="0.3" ry="1.2" fill="#3D2A1F"/>
                </g>
              </g>
            )}

            {/* === RODNEY (cartoon dog) === */}
            <g style={{transition:'all 3s ease-in-out', cursor:'pointer'}}
               transform={`translate(${rodneyPos.x},${rodneyPos.y})`}
               onClick={() => onZoneTap('rodney')}>
              <ellipse cx="0" cy="4" rx="7" ry="1.5" fill="rgba(0,0,0,0.22)"/>
              {/* Body */}
              <ellipse cx="0" cy="0" rx="6" ry="3.5" fill="#A6845C" stroke="#5C3A2A" strokeWidth="0.4"/>
              {/* Belly highlight */}
              <ellipse cx="0" cy="1.2" rx="4.5" ry="2.2" fill="#C29870"/>
              {/* Spot pattern */}
              <ellipse cx="2" cy="-0.5" rx="1.5" ry="1.2" fill="#7A5F3D" opacity="0.5"/>
              {/* Legs */}
              <rect x="-4.5" y="2.5" width="1.4" height="2.5" fill="#7A5F3D"/>
              <rect x="-2" y="2.5" width="1.4" height="2.5" fill="#7A5F3D"/>
              <rect x="0.6" y="2.5" width="1.4" height="2.5" fill="#7A5F3D"/>
              <rect x="3.1" y="2.5" width="1.4" height="2.5" fill="#7A5F3D"/>
              {/* Paw pads */}
              <ellipse cx="-3.8" cy="5" rx="0.8" ry="0.3" fill="#5C3A2A"/>
              <ellipse cx="-1.3" cy="5" rx="0.8" ry="0.3" fill="#5C3A2A"/>
              <ellipse cx="1.3" cy="5" rx="0.8" ry="0.3" fill="#5C3A2A"/>
              <ellipse cx="3.8" cy="5" rx="0.8" ry="0.3" fill="#5C3A2A"/>
              {/* Wagging tail */}
              <path d="M 5.5,-1.2 Q 8.5,-3 8,-5.5 Q 7,-6 6.5,-5" fill="none" stroke="#7A5F3D" strokeWidth="1.4" strokeLinecap="round"/>
              <ellipse cx="8" cy="-5" rx="0.7" ry="0.5" fill="#A6845C"/>
              {/* Head */}
              <circle cx="-5.8" cy="-1.5" r="3.1" fill="#A6845C" stroke="#5C3A2A" strokeWidth="0.4"/>
              {/* Snout */}
              <ellipse cx="-7.8" cy="-0.5" rx="1.8" ry="1.4" fill="#C29870" stroke="#7A5F3D" strokeWidth="0.25"/>
              {/* Mouth line */}
              <path d="M -8.5,-0.1 Q -8,0.4 -7.4,0.1 Q -6.8,-0.1 -6.5,-0.5" stroke="#5C3A2A" strokeWidth="0.25" fill="none"/>
              {/* Tongue (when thriving) */}
              {overall >= 3 && (
                <ellipse cx="-7.8" cy="0.6" rx="0.7" ry="0.5" fill="#E89BB0" stroke="#A85420" strokeWidth="0.15"/>
              )}
              {/* Nose */}
              <ellipse cx="-9" cy="-0.9" rx="0.7" ry="0.55" fill="#1F1410"/>
              <circle cx="-9.1" cy="-1.05" r="0.15" fill="rgba(255,255,255,0.6)"/>
              {/* Floppy ear */}
              <path d="M -7,-3.7 Q -8.6,-2.5 -7.8,-0.4 Q -8.2,-0.2 -8.5,-0.5 Q -9,-2.5 -7.5,-3.8 Z" fill="#7A5F3D" stroke="#5C3A2A" strokeWidth="0.3"/>
              {/* Other ear (peeking) */}
              <path d="M -4,-3.5 Q -3.5,-3 -3.5,-2 Q -4,-2.2 -4.3,-2.7 Z" fill="#7A5F3D" stroke="#5C3A2A" strokeWidth="0.25"/>
              {/* Eye */}
              <ellipse cx="-5.3" cy="-2" rx="0.55" ry="0.55" fill="#1F1410"/>
              <circle cx="-5.1" cy="-2.15" r="0.2" fill="white"/>
              {/* Eyebrow */}
              <path d="M -5.8,-2.7 q 0.5,-0.3 1,0" stroke="#5C3A2A" strokeWidth="0.25" fill="none"/>
              {/* Collar */}
              <ellipse cx="-4.5" cy="0.5" rx="2" ry="0.7" fill="#C84A3F" stroke="#7A2818" strokeWidth="0.25"/>
              <circle cx="-4.5" cy="0.9" r="0.4" fill="#F5C66C" stroke="#A85420" strokeWidth="0.15"/>
              {/* Label */}
              <g style={{pointerEvents:'none'}}>
                <rect x="-7" y="6.5" width="14" height="3.2" rx="1.6" fill="rgba(255,255,255,0.92)" stroke="rgba(60,40,20,0.25)" strokeWidth="0.2"/>
                <text x="0" y="8.7" fontSize="2.2" fill="#3D2A1F" textAnchor="middle"
                      style={{fontFamily:'Quicksand,sans-serif', fontWeight:700, letterSpacing:'0.06em'}}>RODNEY</text>
              </g>
            </g>

            {/* === FORREST (cartoon ginger cat) === */}
            <g style={{transition:'all 4s ease-in-out', cursor:'pointer'}}
               transform={`translate(${forrestPos.x},${forrestPos.y})`}
               onClick={() => onZoneTap('forrest')}>
              <ellipse cx="0" cy="3.5" rx="6" ry="1.3" fill="rgba(0,0,0,0.22)"/>
              {/* Body */}
              <ellipse cx="0.5" cy="0" rx="5.2" ry="2.8" fill="#E68B3F" stroke="#A85420" strokeWidth="0.4"/>
              {/* Ginger stripes — more visible */}
              <path d="M -2.5,-2 Q -2,-2.6 -1,-2" stroke="#A85420" strokeWidth="0.55" fill="none"/>
              <path d="M 0.5,-2.2 Q 1,-2.8 2,-2.2" stroke="#A85420" strokeWidth="0.55" fill="none"/>
              <path d="M 3,-1.6 Q 3.5,-2.2 4.5,-1.6" stroke="#A85420" strokeWidth="0.55" fill="none"/>
              <path d="M -1,-0.5 Q -0.3,-0.2 0.3,-0.6" stroke="#A85420" strokeWidth="0.4" fill="none"/>
              <path d="M 2.5,-0.3 Q 3.2,0 3.8,-0.4" stroke="#A85420" strokeWidth="0.4" fill="none"/>
              {/* White belly */}
              <ellipse cx="0.5" cy="1.3" rx="3" ry="1.3" fill="#FFF5E8" opacity="0.85"/>
              {/* Legs */}
              <rect x="-3.2" y="1.8" width="1.2" height="2.3" fill="#C97D3A"/>
              <rect x="-1.2" y="1.8" width="1.2" height="2.3" fill="#C97D3A"/>
              <rect x="0.8" y="1.8" width="1.2" height="2.3" fill="#C97D3A"/>
              <rect x="2.8" y="1.8" width="1.2" height="2.3" fill="#C97D3A"/>
              <ellipse cx="-2.6" cy="4.1" rx="0.6" ry="0.25" fill="#A85420"/>
              <ellipse cx="-0.6" cy="4.1" rx="0.6" ry="0.25" fill="#A85420"/>
              <ellipse cx="1.4" cy="4.1" rx="0.6" ry="0.25" fill="#A85420"/>
              <ellipse cx="3.4" cy="4.1" rx="0.6" ry="0.25" fill="#A85420"/>
              {/* Curled tail */}
              <path d="M 5,-1 Q 7.5,-2 7.5,-4.5 Q 6.5,-6 4.5,-5 Q 5.5,-4.5 6,-4 Q 6.5,-3 5.5,-2.5" fill="none" stroke="#E68B3F" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M 5,-1 Q 7.5,-2 7.5,-4.5 Q 6.5,-6 4.5,-5" fill="none" stroke="#A85420" strokeWidth="0.3" strokeLinecap="round"/>
              {/* Tail stripes */}
              <line x1="6" y1="-2" x2="7" y2="-1.5" stroke="#A85420" strokeWidth="0.4"/>
              <line x1="7.3" y1="-3.5" x2="7.7" y2="-3" stroke="#A85420" strokeWidth="0.4"/>
              {/* Head */}
              <circle cx="-4.5" cy="-1.5" r="2.7" fill="#E68B3F" stroke="#A85420" strokeWidth="0.4"/>
              {/* Forehead stripes */}
              <line x1="-5.5" y1="-3" x2="-5" y2="-2.5" stroke="#A85420" strokeWidth="0.4"/>
              <line x1="-4.5" y1="-3.3" x2="-4" y2="-2.7" stroke="#A85420" strokeWidth="0.4"/>
              <line x1="-3.5" y1="-3" x2="-3" y2="-2.5" stroke="#A85420" strokeWidth="0.4"/>
              {/* Triangle ears */}
              <polygon points="-6.2,-3 -5.4,-5 -4.6,-3" fill="#E68B3F" stroke="#A85420" strokeWidth="0.3"/>
              <polygon points="-3.8,-3 -3,-5 -2.2,-3" fill="#E68B3F" stroke="#A85420" strokeWidth="0.3"/>
              {/* Inner ear */}
              <polygon points="-5.9,-3.1 -5.4,-4.3 -4.9,-3.1" fill="#F5B5C5"/>
              <polygon points="-3.5,-3.1 -3,-4.3 -2.5,-3.1" fill="#F5B5C5"/>
              {/* Eyes - cat-like with vertical pupils */}
              <ellipse cx="-5.3" cy="-1.6" rx="0.5" ry="0.7" fill="#5C8048"/>
              <ellipse cx="-3.7" cy="-1.6" rx="0.5" ry="0.7" fill="#5C8048"/>
              <ellipse cx="-5.3" cy="-1.6" rx="0.18" ry="0.6" fill="#1F1410"/>
              <ellipse cx="-3.7" cy="-1.6" rx="0.18" ry="0.6" fill="#1F1410"/>
              <circle cx="-5.2" cy="-1.85" r="0.13" fill="white"/>
              <circle cx="-3.6" cy="-1.85" r="0.13" fill="white"/>
              {/* Nose - pink triangle */}
              <path d="M -4.7,-0.7 L -4.5,-0.3 L -4.3,-0.7 Z" fill="#F5B5C5" stroke="#A85420" strokeWidth="0.15"/>
              {/* Mouth - W shape */}
              <path d="M -4.5,-0.2 Q -4.8,0.1 -5.1,-0.1 M -4.5,-0.2 Q -4.2,0.1 -3.9,-0.1" stroke="#3D2A1F" strokeWidth="0.25" fill="none"/>
              {/* Whiskers */}
              <line x1="-5.5" y1="-0.4" x2="-7.3" y2="-0.3" stroke="#3D2A1F" strokeWidth="0.18"/>
              <line x1="-5.5" y1="-0.1" x2="-7.3" y2="0.2" stroke="#3D2A1F" strokeWidth="0.18"/>
              <line x1="-3.5" y1="-0.4" x2="-1.7" y2="-0.3" stroke="#3D2A1F" strokeWidth="0.18"/>
              <line x1="-3.5" y1="-0.1" x2="-1.7" y2="0.2" stroke="#3D2A1F" strokeWidth="0.18"/>
              {/* Label */}
              <g style={{pointerEvents:'none'}}>
                <rect x="-7" y="6" width="14" height="3.2" rx="1.6" fill="rgba(255,255,255,0.92)" stroke="rgba(60,40,20,0.25)" strokeWidth="0.2"/>
                <text x="0" y="8.2" fontSize="2.2" fill="#3D2A1F" textAnchor="middle"
                      style={{fontFamily:'Quicksand,sans-serif', fontWeight:700, letterSpacing:'0.06em'}}>FORREST</text>
              </g>
            </g>

            {/* Subtle vignette gradient (defined here but applied later) */}
            <radialGradient id="vignette" cx="0.5" cy="0.5">
              <stop offset="70%" stopColor="black" stopOpacity="0"/>
              <stop offset="100%" stopColor="black" stopOpacity="0.18"/>
            </radialGradient>
            </g>
            {/* End sketch-filter scene wrapper */}
            <rect x="0" y="0" width="200" height="280" fill="url(#vignette)" pointerEvents="none"/>
            {/* Outer paper-edge frame for hand-drawn feel */}
            <rect x="1" y="1" width="198" height="278" fill="none" stroke="rgba(70,50,30,0.18)" strokeWidth="0.6" strokeDasharray="0.4 1.2" pointerEvents="none"/>
          </svg>

          {state.holidayMode && (
            <div className="dormant-badge">🏝️ Garden Dormant</div>
          )}
        </div>

        <div className="legend">
          <span className="legend-item"><span className="legend-dot" style={{background:'#10B981'}}/> Thriving</span>
          <span className="legend-item"><span className="legend-dot" style={{background:'#F59E0B'}}/> Needs water</span>
          <span className="legend-item"><span className="legend-dot" style={{background:'#F97316'}}/> Wilting</span>
          <span className="legend-item"><span className="legend-dot" style={{background:'#F43F5E'}}/> Dying</span>
        </div>
      </Section>

      <UrgentJobsList jobs={jobs} holidayMode={state.holidayMode}/>
    </>
  );
}

function ZoneGroup({ id, health, count, onTap, children, labelX, labelY, label }) {
  const filterUrl = health === 4 ? '' : health === 3 ? 'url(#wilt-3)' : health === 2 ? 'url(#wilt-2)' : 'url(#wilt-1)';
  const isUrgent = health <= 2 && count > 0;
  // 1.7 per char × 2.4 fontSize + 6 padding = comfortable for "GREENHOUSE" (10 chars)
  const labelWidth = label ? Math.max(14, label.length * 1.7 + 6) : 14;
  return (
    <g style={{cursor:'pointer'}} onClick={onTap}>
      {isUrgent && labelX !== undefined && (
        <ellipse cx={labelX} cy={labelY - 3} rx="22" ry="14"
                 fill={health === 1 ? '#FCA5A5' : '#FED7AA'} opacity="0.4"
                 style={{animation: health === 1 ? 'pulseGlow 2s ease-in-out infinite' : undefined}}/>
      )}
      <g filter={filterUrl}>{children}</g>
      {label && labelX !== undefined && (
        <g style={{pointerEvents:'none'}}>
          <rect x={labelX - labelWidth/2} y={labelY - 1.5} width={labelWidth} height="3.6" rx="1.8"
                fill="rgba(255,255,255,0.92)" stroke="rgba(60,40,20,0.25)" strokeWidth="0.2"/>
          <text x={labelX} y={labelY + 1.2} fontSize="2.4" fill="#3D2A1F" textAnchor="middle"
                style={{fontFamily:'Quicksand,sans-serif', fontWeight:700, letterSpacing:'0.06em'}}>{label.toUpperCase()}</text>
        </g>
      )}
      {count > 0 && labelX !== undefined && (
        <g style={{pointerEvents:'none'}}>
          <circle cx={labelX + labelWidth/2 - 1} cy={labelY - 1} r="2.2"
                  fill={health <= 2 ? '#DC2626' : '#D97706'} stroke="white" strokeWidth="0.5"/>
          <text x={labelX + labelWidth/2 - 1} y={labelY - 0.1} fontSize="2.6"
                fill="white" textAnchor="middle" fontWeight="bold">{count}</text>
        </g>
      )}
    </g>
  );
}

function UrgentJobsList({ jobs, holidayMode }) {
  const urgencyOrder = { 'neglected': 0, 'overdue': 1, 'due-soon': 2 };
  const urgent = jobs
    .filter(j => {
      const u = getJobUrgency(j, holidayMode);
      return u === 'overdue' || u === 'neglected' || u === 'due-soon';
    })
    .sort((a, b) => {
      const ua = getJobUrgency(a, holidayMode);
      const ub = getJobUrgency(b, holidayMode);
      return (urgencyOrder[ua] ?? 9) - (urgencyOrder[ub] ?? 9);
    })
    .slice(0, 8);

  if (urgent.length === 0) {
    return (
      <Section title="All thriving" subtitle="nothing due right now — well done you two">
        <div className="empty-card">
          <div style={{fontSize:'2.5rem',marginBottom:'0.5rem'}}>🌿</div>
          <p style={{fontFamily:'Caveat, cursive', fontSize:'20px', color:'#5C5044'}}>The garden is happy today.</p>
        </div>
      </Section>
    );
  }

  const dying  = urgent.filter(j => getJobUrgency(j, holidayMode) === 'neglected');
  const due    = urgent.filter(j => getJobUrgency(j, holidayMode) === 'overdue');
  const soon   = urgent.filter(j => getJobUrgency(j, holidayMode) === 'due-soon');
  const title  = dying.length  ? 'Needs rescuing 🔴'
               : due.length    ? 'Needs doing today 🟠'
               : 'Coming up soon 🟡';
  const sub    = dying.length  ? `${dying.length} job${dying.length > 1 ? 's' : ''} badly neglected`
               : due.length    ? `${due.length} job${due.length > 1 ? 's' : ''} due — tap to tick off`
               : `${soon.length} job${soon.length > 1 ? 's' : ''} due in the next day or two`;

  return (
    <Section title={title} subtitle={sub}>
      <div className="job-list">
        {urgent.map(j => <JobMiniCard key={j.id} job={j} holidayMode={holidayMode}/>)}
      </div>
    </Section>
  );
}

function JobMiniCard({ job, holidayMode }) {
  const u = getJobUrgency(job, holidayMode);
  const meta = URGENCY_META[u];
  return (
    <div className={`job-mini ${meta.bg}`}>
      <span style={{fontSize:'1.5rem'}}>{job.emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontWeight:600,color:'#3D2A1F',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{job.name}</p>
        <p className={`text-xs ${meta.text}`}>{meta.label} · {ZONES[job.zone]?.name}</p>
      </div>
      <span style={{fontWeight:700,color:'#3D2A1F'}}>+{calcJobPoints(job, holidayMode, false)}</span>
    </div>
  );
}

// =============================================================================
// FREQUENCY GROUPING
// =============================================================================

const FREQ_GROUPS = [
  { key: 'due',        label: 'Due now',    emoji: '🔴', test: (j, hm) => { const u = getJobUrgency(j,hm); return u==='neglected'||u==='overdue'||u==='due-soon'; } },
  { key: 'daily',      label: 'Daily',      emoji: '☀️',  test: (j) => j.type==='tappable' || (j.type==='recurring' && j.frequencyDays <= 6) },
  { key: 'weekly',     label: 'Weekly',     emoji: '📅',  test: (j) => j.type==='recurring' && j.frequencyDays >= 7  && j.frequencyDays <= 14 },
  { key: 'monthly',    label: 'Monthly',    emoji: '🗓️',  test: (j) => j.type==='recurring' && j.frequencyDays >= 15 && j.frequencyDays <= 60 },
  { key: 'quarterly',  label: 'Quarterly',  emoji: '🍂',  test: (j) => j.type==='recurring' && j.frequencyDays >= 61 && j.frequencyDays <= 150 },
  { key: 'biannual',   label: 'Bi-annual',  emoji: '🌓',  test: (j) => j.type==='recurring' && j.frequencyDays >= 151 && j.frequencyDays <= 270 },
  { key: 'annual',     label: 'Annual',     emoji: '🎄',  test: (j) => j.type==='annual' || (j.type==='recurring' && j.frequencyDays > 270) },
  { key: 'oneoff',     label: 'One-offs',   emoji: '✨',  test: (j) => j.type==='oneoff' },
];

const getFreqGroup = (job, holidayMode) => {
  // "Due now" takes priority regardless of frequency
  const u = getJobUrgency(job, holidayMode);
  if (u === 'neglected' || u === 'overdue' || u === 'due-soon') return 'due';
  for (const g of FREQ_GROUPS.slice(1)) {
    if (g.test(job, holidayMode)) return g.key;
  }
  return 'daily';
};

// =============================================================================
// JOBS VIEW
// =============================================================================

function JobsView({ jobs, user, holidayMode, hotStreakActive, onComplete, onAdd, onEdit, onDelete, onTogglePause, onAssign }) {
  const [view, setView] = useState('due');      // 'due' | 'frequency' | 'zone'
  const [assignFilter, setAssignFilter] = useState('all'); // 'all' | 'mine'
  const [zoneFilter, setZoneFilter] = useState('all');

  // Base list — optionally filtered by assigned-to and zone
  const base = jobs.filter(j => {
    if (assignFilter === 'mine' && j.assignedTo !== user && j.assignedTo !== 'either') return false;
    if (zoneFilter !== 'all' && j.zone !== zoneFilter) return false;
    return true;
  });

  const urgencyOrder = { 'neglected': 0, 'overdue': 1, 'due-soon': 2, 'routine': 3, 'paused': 4, 'tappable': 5 };

  // ── View: by urgency (default) ──────────────────────────────────────────────
  const sorted = [...base].sort((a, b) => {
    const ua = getJobUrgency(a, holidayMode);
    const ub = getJobUrgency(b, holidayMode);
    if (urgencyOrder[ua] !== urgencyOrder[ub]) return urgencyOrder[ua] - urgencyOrder[ub];
    return calcJobPoints(b, holidayMode, false) - calcJobPoints(a, holidayMode, false);
  });

  // ── View: by frequency ──────────────────────────────────────────────────────
  const byFreq = FREQ_GROUPS.map(g => {
    const items = base.filter(j => {
      // In "due" group: any urgency matches
      if (g.key === 'due') {
        const u = getJobUrgency(j, holidayMode);
        return u === 'neglected' || u === 'overdue' || u === 'due-soon';
      }
      // Other groups: only routine/paused/tappable jobs (due ones already in "due" group)
      const u = getJobUrgency(j, holidayMode);
      if (u === 'neglected' || u === 'overdue' || u === 'due-soon') return false;
      return g.test(j, holidayMode);
    }).sort((a,b) => {
      const ua = getJobUrgency(a, holidayMode);
      const ub = getJobUrgency(b, holidayMode);
      if (urgencyOrder[ua] !== urgencyOrder[ub]) return urgencyOrder[ua] - urgencyOrder[ub];
      return (a.frequencyDays||0) - (b.frequencyDays||0);
    });
    return { ...g, items };
  }).filter(g => g.items.length > 0);

  // ── View: by zone ────────────────────────────────────────────────────────────
  const byZone = Object.entries(ZONES).map(([zk, zv]) => {
    const items = base.filter(j => j.zone === zk).sort((a,b) => {
      const ua = getJobUrgency(a, holidayMode);
      const ub = getJobUrgency(b, holidayMode);
      return (urgencyOrder[ua]??9) - (urgencyOrder[ub]??9);
    });
    return { key: zk, label: zv.name, room: zv.room, items };
  }).filter(z => z.items.length > 0);

  const dueCount = base.filter(j => {
    const u = getJobUrgency(j, holidayMode);
    return u === 'neglected' || u === 'overdue' || u === 'due-soon';
  }).length;

  const renderList = (list) => list.map(j => (
    <JobCard key={j.id} job={j} user={user} holidayMode={holidayMode} hotStreakActive={hotStreakActive}
      onComplete={() => onComplete(j)} onEdit={() => onEdit(j)}
      onDelete={() => onDelete(j.id)} onTogglePause={() => onTogglePause(j)}
      onAssign={(who) => onAssign(j, who)}/>
  ));

  return (
    <Section title="Jobs" subtitle={`${base.length} jobs${dueCount ? ` · ${dueCount} due` : ''}`}
             action={<button onClick={onAdd} className="btn-add">+ Add</button>}>

      {/* View toggle */}
      <div className="seg" style={{marginBottom:'0.6rem'}}>
        <button onClick={() => setView('due')}       className={view==='due'       ? 'seg-active':''}>
          {dueCount > 0 ? `🔴 Due (${dueCount})` : '✅ By urgency'}
        </button>
        <button onClick={() => setView('frequency')} className={view==='frequency' ? 'seg-active':''}>📅 Frequency</button>
        <button onClick={() => setView('zone')}      className={view==='zone'      ? 'seg-active':''}>🌿 Zone</button>
      </div>

      {/* Secondary filters */}
      <div style={{display:'flex',gap:'0.4rem',marginBottom:'0.5rem',flexWrap:'wrap'}}>
        <button onClick={() => setAssignFilter(assignFilter==='mine' ? 'all':'mine')}
          className={`chip-btn ${assignFilter==='mine' ? 'chip-active':''}`}>
          {assignFilter==='mine' ? '👤 Yours only' : '👥 All'}
        </button>
        {view === 'due' && (
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} className="zone-select" style={{flex:1,marginBottom:0}}>
            <option value="all">All zones</option>
            {Object.entries(ZONES).map(([k,v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        )}
      </div>

      {/* ── Due / urgency view ── */}
      {view === 'due' && (
        sorted.length === 0
          ? <div className="empty-card"><p style={{color:'#7E7268',fontStyle:'italic'}}>No jobs match.</p></div>
          : <div className="job-list">{renderList(sorted)}</div>
      )}

      {/* ── Frequency grouped view ── */}
      {view === 'frequency' && (
        byFreq.length === 0
          ? <div className="empty-card"><p style={{color:'#7E7268',fontStyle:'italic'}}>No jobs match.</p></div>
          : byFreq.map(g => (
            <div key={g.key} style={{marginBottom:'1.25rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginBottom:'0.4rem',padding:'0 0.1rem'}}>
                <span style={{fontSize:'1.1rem'}}>{g.emoji}</span>
                <span style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.15rem',color:'#3D2A1F'}}>{g.label}</span>
                <span style={{fontSize:'0.7rem',color:'#9C9082',fontWeight:600,background:'rgba(60,40,20,0.07)',padding:'0.1rem 0.5rem',borderRadius:'9999px'}}>{g.items.length}</span>
              </div>
              <div className="job-list">{renderList(g.items)}</div>
            </div>
          ))
      )}

      {/* ── Zone grouped view ── */}
      {view === 'zone' && (
        byZone.length === 0
          ? <div className="empty-card"><p style={{color:'#7E7268',fontStyle:'italic'}}>No jobs match.</p></div>
          : byZone.map(z => (
            <div key={z.key} style={{marginBottom:'1.25rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginBottom:'0.4rem',padding:'0 0.1rem'}}>
                <span style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.15rem',color:'#3D2A1F'}}>{z.label}</span>
                <span style={{fontSize:'0.7rem',color:'#9C9082',fontStyle:'italic'}}>{z.room}</span>
                <span style={{fontSize:'0.7rem',color:'#9C9082',fontWeight:600,background:'rgba(60,40,20,0.07)',padding:'0.1rem 0.5rem',borderRadius:'9999px',marginLeft:'auto'}}>{z.items.length}</span>
              </div>
              <div className="job-list">{renderList(z.items)}</div>
            </div>
          ))
      )}
    </Section>
  );
}

function JobCard({ job, user, holidayMode, hotStreakActive, onComplete, onEdit, onDelete, onTogglePause, onAssign }) {
  const u = getJobUrgency(job, holidayMode);
  const meta = URGENCY_META[u];
  const points = calcJobPoints(job, holidayMode, hotStreakActive);
  const [expanded, setExpanded] = useState(false);

  const subtext = job.type === 'tappable'
    ? `${ZONES[job.zone]?.name} · tap each time you do it`
    : job.type === 'oneoff'
      ? `${ZONES[job.zone]?.name} · one-off${job.dueDate ? ` · due ${job.dueDate}` : ''}`
      : job.type === 'annual'
        ? `${ZONES[job.zone]?.name} · yearly${job.dueDate ? ` · due ${job.dueDate}` : ''}`
        : job.lastCompleted
          ? `${ZONES[job.zone]?.name} · last done ${daysSinceText(job.lastCompleted)} by ${job.lastCompletedBy || '—'}`
          : `${ZONES[job.zone]?.name} · never done`;

  const cardClass = u === 'neglected' ? 'job-card border-rose'
    : u === 'overdue' ? 'job-card border-orange'
    : u === 'due-soon' ? 'job-card border-amber'
    : u === 'paused' ? 'job-card border-stone opacity-70'
    : 'job-card';

  return (
    <div className={cardClass}>
      <div className="job-card-main">
        <span style={{fontSize:'2rem'}}>{job.emoji}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
            <p style={{fontWeight:600,color:'#3D2A1F',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{job.name}</p>
            <span className={`tag ${meta.bg} ${meta.text}`}>{meta.label}</span>
            {job.assignedTo && job.assignedTo !== 'either' && (
              <span className={`tag ${job.assignedTo === user ? 'tag-mine' : 'tag-theirs'}`}>
                {job.assignedTo === user ? 'YOURS' : `${job.assignedTo.toUpperCase()}'S`}
              </span>
            )}
          </div>
          <p className="text-xs" style={{color:'#7E7268',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{subtext}</p>
        </div>
        <button onClick={onComplete} className="btn-complete">
          {job.type === 'tappable' ? '+1' : '✓'}
          <span> +{points}</span>
        </button>
      </div>
      <div className="job-card-actions">
        <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide' : 'Details'}</button>
        <button onClick={onTogglePause}>{job.urgencyOverride === 'paused' ? '▶ Resume' : '❚❚ Pause'}</button>
        <button onClick={() => {
          const cycle = { 'either': user, [user]: user === 'George' ? 'Sammy' : 'George', [user === 'George' ? 'Sammy' : 'George']: 'either' };
          onAssign(cycle[job.assignedTo || 'either']);
        }}>Assign</button>
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDelete} style={{color:'#DC2626'}}>Delete</button>
      </div>
      {expanded && (
        <div className="job-card-details">
          <p><strong>Time:</strong> {['','Quick','Short','Medium','Long','Very long'][job.timeScore]} ({job.timeScore}/5)</p>
          <p><strong>Unpleasantness:</strong> {['','Easy','Mild','Moderate','Bad','Awful'][job.unpleasantnessScore]} ({job.unpleasantnessScore}/5)</p>
          {job.frequencyDays && <p><strong>Frequency:</strong> every {job.frequencyDays} days</p>}
          {job.dueDate && <p><strong>Due:</strong> {job.dueDate}</p>}
          <p><strong>Assigned to:</strong> {job.assignedTo || 'either'}</p>
          <p><strong>Base seeds:</strong> {calcBasePoints(job)} (× {URGENCY_META[u].mult} urgency{hotStreakActive ? ' × 1.25 hot streak' : ''} = {points})</p>
        </div>
      )}
    </div>
  );
}

function daysSinceText(iso) {
  const d = daysBetween(iso, todayISO());
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

// =============================================================================
// ZONE MODAL
// =============================================================================

function ZoneModal({ zone, jobs, user, holidayMode, hotStreakActive, onClose, onComplete }) {
  const z = ZONES[zone];
  return (
    <Modal onClose={onClose}>
      <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem'}}>
        <div>
          <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem',color:'#3D2A1F'}}>{z.name}</h2>
          <p className="text-xs" style={{color:'#7E7268',fontStyle:'italic'}}>{z.room}</p>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p style={{textAlign:'center',color:'#7E7268',fontStyle:'italic',padding:'1.5rem 0'}}>No jobs in this zone.</p>
      ) : (
        <div className="job-list">
          {jobs.map(j => (
            <JobCard key={j.id} job={j} user={user} holidayMode={holidayMode} hotStreakActive={hotStreakActive}
              onComplete={() => onComplete(j)}
              onEdit={() => {}} onDelete={() => {}} onTogglePause={() => {}} onAssign={() => {}}/>
          ))}
        </div>
      )}
    </Modal>
  );
}

// =============================================================================
// JOB FORM
// =============================================================================

function JobFormModal({ mode, job, onClose, onSave }) {
  const [form, setForm] = useState(job || {
    name: '', emoji: '🌿', zone: 'lawn', type: 'recurring',
    timeScore: 2, unpleasantnessScore: 2, frequencyDays: 7, dueDate: '', assignedTo: 'either',
  });
  const [nameError, setNameError] = useState(false);

  const submit = () => {
    if (!form.name.trim()) { setNameError(true); return; }
    const cleaned = { ...form };
    if (cleaned.type !== 'recurring') delete cleaned.frequencyDays;
    if (cleaned.type === 'recurring' || cleaned.type === 'tappable') delete cleaned.dueDate;
    onSave(cleaned);
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem',color:'#3D2A1F',marginBottom:'1rem'}}>
        {mode === 'add' ? 'Add a job' : 'Edit job'}
      </h2>
      <div style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>
        <div>
          <label className="lbl">Name</label>
          <input value={form.name} onChange={e => { setForm({...form, name: e.target.value}); setNameError(false); }}
                 className={`input ${nameError ? 'input-error' : ''}`} placeholder="e.g. Clean the porch"/>
          {nameError && <p style={{fontSize:'0.75rem',color:'#DC2626',marginTop:'0.25rem'}}>Please give the job a name</p>}
        </div>
        <div>
          <label className="lbl">Emoji</label>
          <input value={form.emoji} onChange={e => setForm({...form, emoji: e.target.value})}
                 className="input" maxLength="2" style={{fontSize:'1.5rem'}}/>
        </div>
        <div>
          <label className="lbl">Garden zone</label>
          <select value={form.zone} onChange={e => setForm({...form, zone: e.target.value})} className="input">
            {Object.entries(ZONES).map(([k,v]) => (
              <option key={k} value={k}>{v.name} ({v.room})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">Assigned to</label>
          <div className="seg">
            {['either', 'George', 'Sammy'].map(a => (
              <button key={a} onClick={() => setForm({...form, assignedTo: a})}
                className={form.assignedTo === a ? 'seg-active' : ''}>{a === 'either' ? 'Either' : a}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="lbl">Type</label>
          <div className="seg">
            {[
              ['recurring', 'Recurring'],
              ['tappable', 'Tap-to-log'],
              ['oneoff', 'One-off'],
              ['annual', 'Annual'],
            ].map(([v, l]) => (
              <button key={v} onClick={() => setForm({...form, type: v})}
                className={form.type === v ? 'seg-active' : ''}>{l}</button>
            ))}
          </div>
        </div>
        {form.type === 'recurring' && (
          <div>
            <label className="lbl">Frequency (days)</label>
            <input type="number" min="1" value={form.frequencyDays || 7}
                   onChange={e => setForm({...form, frequencyDays: parseInt(e.target.value) || 1})} className="input"/>
          </div>
        )}
        {(form.type === 'oneoff' || form.type === 'annual') && (
          <div>
            <label className="lbl">Due date</label>
            <input type="date" value={form.dueDate || ''}
                   onChange={e => setForm({...form, dueDate: e.target.value})} className="input"/>
          </div>
        )}
        <div>
          <label className="lbl">Time required: {['','Quick','Short','Medium','Long','Very long'][form.timeScore]}</label>
          <input type="range" min="1" max="5" value={form.timeScore}
                 onChange={e => setForm({...form, timeScore: parseInt(e.target.value)})} style={{width:'100%'}}/>
        </div>
        <div>
          <label className="lbl">Unpleasantness: {['','Easy','Mild','Moderate','Bad','Awful'][form.unpleasantnessScore]}</label>
          <input type="range" min="1" max="5" value={form.unpleasantnessScore}
                 onChange={e => setForm({...form, unpleasantnessScore: parseInt(e.target.value)})} style={{width:'100%'}}/>
        </div>
        <div className="info-card">
          <strong>Base seeds:</strong> {(form.timeScore + form.unpleasantnessScore) * 5} (more if it gets neglected!)
        </div>
        <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem'}}>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} className="btn-primary">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// SHOP VIEW
// =============================================================================

function ShopView({ shop, state, monthlyAvailable, totalLifetime, onBuy, onAdd, onDelete, onEdit }) {
  const monthName = new Date().toLocaleString('en-GB', { month: 'long' });

  // Normalise: items without a kind default to "paid" if value > 0, else "free"
  const norm = shop.map(it => ({
    ...it,
    kind: it.kind || ((it.value || 0) > 0 ? 'paid' : 'free'),
    unlockAt: it.unlockAt || 0,
  }));

  // Sort each group sensibly
  const freeItems = norm.filter(i => i.kind === 'free').sort((a,b) => a.unlockAt - b.unlockAt);
  const paidItems = norm.filter(i => i.kind === 'paid').sort((a,b) => (a.value||0) - (b.value||0));

  const renderCard = (item) => {
    const isFree = item.kind === 'free';
    const unlocked = !isFree || totalLifetime >= item.unlockAt;
    const canAfford = isFree ? unlocked : (monthlyAvailable + 0.01 >= (item.value||0));
    const enabled = isFree ? unlocked : canAfford;
    const seedsToUnlock = Math.max(0, item.unlockAt - totalLifetime);
    return (
      <div key={item.id} className={`shop-card ${enabled ? '' : 'shop-disabled'}`}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'0.4rem'}}>
          <div style={{fontSize:'2rem'}}>{item.emoji}</div>
          {isFree && (
            <span className="tag" style={{background: unlocked ? '#D1FAE5' : 'rgba(60,40,20,0.08)', color: unlocked ? '#047857' : '#7E7268'}}>
              {unlocked ? 'FREE 🎁' : `🔒 ${item.unlockAt}`}
            </span>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.25rem',flexWrap:'wrap'}}>
          <h3 style={{fontWeight:600,color:'#3D2A1F'}}>{item.name}</h3>
          {item.joint && <span className="tag tag-joint">JOINT</span>}
        </div>
        <p style={{fontFamily:'Caveat, cursive',fontSize:'15px',color:'#7E7268',fontStyle:'italic',margin:'0.25rem 0 0.75rem'}}>{item.description}</p>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            {isFree ? (
              unlocked
                ? <span style={{fontWeight:700,color:'#5C8048',fontSize:'1rem'}}>Unlocked</span>
                : <span className="text-xs" style={{color:'#7E7268'}}>Earn {seedsToUnlock} more lifetime seeds 🌱</span>
            ) : (
              <>
                <span style={{fontWeight:700,color:'#3D2A1F',fontSize:'1.125rem'}}>£{item.value}</span>
                <span className="text-xs" style={{color:'#7E7268',marginLeft:'0.25rem'}}>· {calcSeedCost(item.value, state)} seeds</span>
              </>
            )}
          </div>
          <div style={{display:'flex',gap:'0.25rem'}}>
            <button onClick={() => onEdit(item)} style={{color:'#9CA3AF',padding:'0 0.5rem',fontSize:'0.85rem'}}>✏️</button>
            <button onClick={() => onDelete(item.id)} style={{color:'#9CA3AF',padding:'0 0.5rem'}}>×</button>
            <button onClick={() => onBuy(item)} disabled={!enabled}
              className={enabled ? 'btn-buy' : 'btn-disabled'}>
              {!enabled
                ? (isFree ? 'Locked' : `+£${((item.value||0) - monthlyAvailable).toFixed(2)}`)
                : (isFree ? 'Redeem' : 'Cash in')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Section title="The Garden Centre" subtitle="spend your monthly pot or redeem free perks"
             action={<button onClick={onAdd} className="btn-add">+ Add</button>}>
      <div className="card-money-shop">
        <p className="text-xs uppercase tracking-widest font-semibold" style={{color:'#5C5044'}}>{monthName} Pot</p>
        <p style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'2.5rem',color:'#3D2A1F'}}>£{monthlyAvailable.toFixed(2)}</p>
        <p className="text-xs" style={{color:'#5C5044'}}>available to spend</p>
        {state.monthSpent > 0 && (
          <p className="text-xs" style={{color:'#5C5044',marginTop:'0.25rem'}}>£{state.monthSpent.toFixed(2)} spent this month</p>
        )}
        <p className="text-xs" style={{color:'#5C5044',marginTop:'0.25rem'}}>🌱 {totalLifetime} lifetime seeds</p>
      </div>

      {freeItems.length > 0 && (
        <div style={{marginBottom:'1.25rem'}}>
          <h3 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.15rem',color:'#3D2A1F',marginBottom:'0.5rem',padding:'0 0.1rem'}}>
            🎁 Free perks
          </h3>
          <div className="shop-grid">{freeItems.map(renderCard)}</div>
        </div>
      )}

      {paidItems.length > 0 && (
        <div>
          <h3 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.15rem',color:'#3D2A1F',marginBottom:'0.5rem',padding:'0 0.1rem'}}>
            💷 From the pot
          </h3>
          <div className="shop-grid">{paidItems.map(renderCard)}</div>
        </div>
      )}
    </Section>
  );
}

function AddShopItemModal({ mode = 'add', item, state, onClose, onSave }) {
  const [form, setForm] = useState(item || {
    name: '', emoji: '🎁', description: '',
    kind: 'paid',
    value: 20,
    unlockAt: 0,
    joint: false,
  });
  const isFree = form.kind === 'free';
  const isEdit = mode === 'edit';
  return (
    <Modal onClose={onClose}>
      <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem',color:'#3D2A1F',marginBottom:'1rem'}}>
        {isEdit ? 'Edit reward' : 'Add a reward'}
      </h2>
      <div style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>

        {/* Kind toggle */}
        <div>
          <label className="lbl">Reward type</label>
          <div className="seg">
            <button onClick={() => setForm({...form, kind: 'paid'})}
              className={!isFree ? 'seg-active' : ''}>💷 Paid (£)</button>
            <button onClick={() => setForm({...form, kind: 'free'})}
              className={isFree ? 'seg-active' : ''}>🎁 Free perk</button>
          </div>
          <p className="text-xs" style={{color:'#7E7268',marginTop:'0.25rem'}}>
            {isFree
              ? 'Costs nothing — unlocks once you hit a lifetime-seed milestone.'
              : 'Comes out of your monthly £ pot.'}
          </p>
        </div>

        <div><label className="lbl">Reward name</label>
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" placeholder={isFree ? 'e.g. Choose dinner' : 'e.g. Pub lunch'}/></div>
        <div><label className="lbl">Emoji</label>
          <input value={form.emoji} onChange={e => setForm({...form, emoji: e.target.value})} className="input" style={{fontSize:'1.5rem'}}/></div>
        <div><label className="lbl">Description</label>
          <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input" placeholder="A few words about it"/></div>

        {isFree ? (
          <div>
            <label className="lbl">Unlock at lifetime seeds</label>
            <input type="number" min="0" step="50" value={form.unlockAt ?? 0}
              onChange={e => setForm({...form, unlockAt: parseInt(e.target.value) || 0})} className="input"/>
            <p className="text-xs" style={{color:'#7E7268',marginTop:'0.25rem'}}>
              {(form.unlockAt ?? 0) === 0 ? 'Available from day one.' : `Locked until total lifetime earnings reach ${form.unlockAt}.`}
            </p>
          </div>
        ) : (
          <div>
            <label className="lbl">£ value</label>
            <input type="number" min="0" step="5" value={form.value ?? 0}
              onChange={e => setForm({...form, value: parseFloat(e.target.value) || 0})} className="input"/>
            <p className="text-xs" style={{color:'#7E7268',marginTop:'0.25rem'}}>≈ {calcSeedCost(form.value ?? 0, state)} seeds at current settings</p>
          </div>
        )}

        <div>
          <label style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
            <input type="checkbox" checked={!!form.joint} onChange={e => setForm({...form, joint: e.target.checked})}/>
            <span>Joint treat (for both of you)</span>
          </label>
        </div>
        <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem'}}>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => {
            if (!form.name.trim()) return;
            const cleaned = { ...form };
            if (isFree) { delete cleaned.value; }
            else { delete cleaned.unlockAt; }
            onSave(cleaned);
          }} className="btn-primary">{isEdit ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// JOURNAL
// =============================================================================

function JournalView({ journal, user, onHighFive }) {
  const [typeFilter, setTypeFilter] = useState('all');     // 'all' | 'completed' | 'purchase' | 'highfive'
  const [whoFilter, setWhoFilter]   = useState('all');     // 'all' | 'George' | 'Sammy'

  if (journal.length === 0) {
    return (
      <Section title="The Garden Journal" subtitle="a record of who tended what">
        <div className="empty-card">
          <div style={{fontSize:'2.5rem',marginBottom:'0.5rem'}}>📖</div>
          <p style={{color:'#7E7268',fontStyle:'italic'}}>Nothing here yet. Complete a job to start the journal.</p>
        </div>
      </Section>
    );
  }

  // Apply filters
  const filtered = journal.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (whoFilter !== 'all' && e.user !== whoFilter) return false;
    return true;
  });

  const grouped = {};
  filtered.forEach(e => {
    const date = e.timestamp.split('T')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(e);
  });

  const dayLabel = (date) => {
    const today = todayISO();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (date === today) return 'Today';
    if (date === yesterday) return 'Yesterday';
    return new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // Counts for each type filter button (respecting current who filter)
  const baseForCounts = whoFilter === 'all' ? journal : journal.filter(e => e.user === whoFilter);
  const counts = {
    all:       baseForCounts.length,
    completed: baseForCounts.filter(e => e.type === 'completed').length,
    purchase:  baseForCounts.filter(e => e.type === 'purchase').length,
    highfive:  baseForCounts.filter(e => e.type === 'highfive').length,
  };

  return (
    <Section title="The Garden Journal" subtitle="a record of who tended what">

      {/* Type filter row */}
      <div className="filter-chips" style={{marginBottom:'0.4rem'}}>
        {[
          ['all',       'All',     counts.all],
          ['completed', '🌱 Jobs', counts.completed],
          ['purchase',  '🎁 Rewards', counts.purchase],
          ['highfive',  '🙌 Hi5s', counts.highfive],
        ].map(([f, l, n]) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            disabled={n === 0 && f !== 'all'}
            className={`chip-btn ${typeFilter === f ? 'chip-active' : ''}`}
            style={n === 0 && f !== 'all' ? {opacity: 0.4} : {}}>
            {l} {n > 0 && <span style={{opacity: 0.7, marginLeft: '0.2rem'}}>{n}</span>}
          </button>
        ))}
      </div>

      {/* Who filter row */}
      <div className="filter-chips" style={{marginBottom:'1rem'}}>
        <button onClick={() => setWhoFilter('all')}    className={`chip-btn ${whoFilter==='all'    ? 'chip-active':''}`}>👥 Both</button>
        <button onClick={() => setWhoFilter('George')} className={`chip-btn ${whoFilter==='George' ? 'chip-active':''}`}>🌻 George</button>
        <button onClick={() => setWhoFilter('Sammy')}  className={`chip-btn ${whoFilter==='Sammy'  ? 'chip-active':''}`}>🌷 Sammy</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-card">
          <p style={{color:'#7E7268',fontStyle:'italic'}}>Nothing matches that filter.</p>
        </div>
      ) : (
      <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
        {Object.entries(grouped).map(([date, entries]) => {
          const totalSeeds = entries.filter(e => e.type === 'completed').reduce((s, e) => s + (e.points || 0), 0);
          return (
            <div key={date}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:'0.5rem'}}>
                <h3 style={{fontFamily:'Caveat, cursive',fontSize:'22px',color:'#3D2A1F'}}>{dayLabel(date)}</h3>
                {totalSeeds > 0 && <span className="text-xs" style={{fontWeight:600,color:'#5C8048'}}>+{totalSeeds} 🌱</span>}
              </div>
              <div className="journal-day">
                {entries.map((e, i) => (
                  <div key={e.id} className={`journal-entry ${i > 0 ? 'with-border' : ''}`}>
                    <span style={{fontSize:'1.5rem'}}>{e.jobEmoji || e.itemEmoji || '✨'}</span>
                    <div style={{flex:1,minWidth:0}}>
                      {e.type === 'completed' && (<p className="text-xs"><strong>{e.user}</strong> tended <em>{e.jobName}</em></p>)}
                      {e.type === 'purchase' && (<p className="text-xs"><strong>{e.user}</strong> {e.itemKind === 'free' ? 'redeemed' : 'cashed in'} <em>{e.itemName}</em>{e.joint ? ' (joint)' : ''}</p>)}
                      {e.type === 'highfive' && (<p className="text-xs">🙌 <strong>{e.user}</strong> high-fived <strong>{e.forUser}</strong> for <em>{e.forJobName}</em></p>)}
                      <p className="text-xs" style={{color:'#7E7268'}}>{new Date(e.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                    </div>
                    {e.type === 'completed' && (
                      <>
                        <span className="text-xs" style={{fontWeight:700,color:'#5C8048'}}>+{e.points}</span>
                        {e.user !== user && (
                          <button onClick={() => onHighFive(e)} className="btn-mini-hf">🙌</button>
                        )}
                      </>
                    )}
                    {e.type === 'purchase' && (
                      e.itemKind === 'free' || (e.itemValue || 0) === 0
                        ? <span className="text-xs" style={{fontWeight:700,color:'#5C8048'}}>FREE 🎁</span>
                        : <span className="text-xs" style={{fontWeight:700,color:'#DC2626'}}>−£{e.itemValue}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </Section>
  );
}

// =============================================================================
// SETTINGS
// =============================================================================

function SettingsModal({ state, user, onClose, onUpdate, onToggleHoliday, onSwitchUser, onReset }) {
  const [form, setForm] = useState({
    georgeTarget: state.weeklyTargets?.George || 200,
    sammyTarget: state.weeklyTargets?.Sammy || 200,
    monthlyBudget: state.monthlyBudget || 100,
    monthlyTarget: state.monthlyTarget || 2000,
    thresholdPct: state.thresholdPct || 70,
  });

  const save = () => {
    onUpdate({
      weeklyTargets: { George: form.georgeTarget, Sammy: form.sammyTarget },
      monthlyBudget: form.monthlyBudget,
      monthlyTarget: form.monthlyTarget,
      thresholdPct: form.thresholdPct,
    });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem',color:'#3D2A1F',marginBottom:'1rem'}}>Settings</h2>
      <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
        {/* Holiday */}
        <div className="settings-block" style={{background:'#E0F2FE',borderColor:'#BAE6FD'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <p style={{fontWeight:600,color:'#3D2A1F'}}>🏝️ Garden Dormancy</p>
              <p className="text-xs" style={{color:'#5C5044'}}>Pause urgency while away</p>
            </div>
            <button onClick={onToggleHoliday} className={state.holidayMode ? 'btn-toggle-on' : 'btn-toggle-off'}>
              {state.holidayMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Monthly £ pot */}
        <div>
          <p className="lbl">Monthly £ Budget</p>
          <input type="number" min="0" step="10" value={form.monthlyBudget}
                 onChange={e => setForm({...form, monthlyBudget: parseFloat(e.target.value) || 0})} className="input"/>
          <p className="text-xs" style={{color:'#7E7268',marginTop:'0.25rem'}}>The £ pot you commit to each month. Unspent rolls over.</p>
        </div>
        <div>
          <p className="lbl">Monthly Seed Target</p>
          <input type="number" min="100" step="100" value={form.monthlyTarget}
                 onChange={e => setForm({...form, monthlyTarget: parseInt(e.target.value) || 100})} className="input"/>
          <p className="text-xs" style={{color:'#7E7268',marginTop:'0.25rem'}}>Total seeds needed to fully unlock the budget.</p>
        </div>
        <div>
          <p className="lbl">Threshold to unlock full budget: {form.thresholdPct}%</p>
          <input type="range" min="50" max="100" step="5" value={form.thresholdPct}
                 onChange={e => setForm({...form, thresholdPct: parseInt(e.target.value)})} style={{width:'100%'}}/>
          <p className="text-xs" style={{color:'#7E7268',marginTop:'0.25rem'}}>Hit this % of seed target → full £{form.monthlyBudget} unlocked.</p>
        </div>

        {/* Weekly targets */}
        <div>
          <p className="lbl">Weekly Seed Targets</p>
          <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
              <span style={{fontSize:'1.5rem'}}>🌻</span>
              <span style={{fontWeight:600,width:'5rem'}}>George</span>
              <input type="number" min="50" step="10" value={form.georgeTarget}
                     onChange={e => setForm({...form, georgeTarget: parseInt(e.target.value) || 100})} className="input" style={{flex:1}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
              <span style={{fontSize:'1.5rem'}}>🌷</span>
              <span style={{fontWeight:600,width:'5rem'}}>Sammy</span>
              <input type="number" min="50" step="10" value={form.sammyTarget}
                     onChange={e => setForm({...form, sammyTarget: parseInt(e.target.value) || 100})} className="input" style={{flex:1}}/>
            </div>
          </div>
        </div>

        <button onClick={save} className="btn-primary">Save settings</button>

        {/* This device */}
        <div>
          <p className="lbl">This device</p>
          <div className="settings-block">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.5rem'}}>
              <span>Logged in as <strong>{user}</strong></span>
              <button onClick={onSwitchUser} style={{textDecoration:'underline'}}>Switch</button>
            </div>
            <div style={{borderTop:'1px dashed rgba(60,40,20,0.12)',paddingTop:'0.5rem'}}>
              <p style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#7E7268',marginBottom:'0.2rem'}}>Shared household ID</p>
              <p style={{fontFamily:'monospace',fontSize:'0.8rem',color:'#3D2A1F',wordBreak:'break-all',background:'rgba(60,40,20,0.05)',padding:'0.4rem 0.6rem',borderRadius:'6px'}}>{householdId}</p>
              <p style={{fontSize:'0.7rem',color:'#9C9082',marginTop:'0.25rem',fontStyle:'italic'}}>Both phones must use the same ID. Set in dist/index.html.</p>
            </div>
          </div>
        </div>

        <p className="text-xs" style={{color:'#7E7268',fontStyle:'italic',textAlign:'center',padding:'0 1rem'}}>
          Homestead syncs in real-time across both devices via Firebase.
        </p>

        <details className="danger-zone">
          <summary>Danger zone</summary>
          <button onClick={onReset} className="btn-danger" style={{marginTop:'0.75rem'}}>Reset everything</button>
        </details>
      </div>
    </Modal>
  );
}

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

function Section({ title, subtitle, children, action }) {
  return (
    <section style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:'0.75rem',padding:'0 0.25rem'}}>
        <div>
          <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem',color:'#3D2A1F'}}>{title}</h2>
          {subtitle && <p style={{fontFamily:'Caveat, cursive',fontSize:'15px',color:'#7E7268',fontStyle:'italic'}}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-body" onClick={e => e.stopPropagation()}>
        <div className="modal-close-row">
          <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <div style={{padding:'0 1.25rem 1.5rem'}}>{children}</div>
      </div>
    </div>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { id: 'garden', label: 'Garden', icon: '🌳' },
    { id: 'jobs', label: 'Jobs', icon: '📋' },
    { id: 'shop', label: 'Centre', icon: '🛒' },
    { id: 'journal', label: 'Journal', icon: '📖' },
  ];
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-grid">
        {items.map(it => (
          <button key={it.id} onClick={() => setView(it.id)} className={view === it.id ? 'nav-active' : 'nav-inactive'}>
            <span style={{fontSize:'1.25rem'}}>{it.icon}</span>
            <span className="text-xs uppercase tracking-widest">{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// =============================================================================
// WELCOME / CONFIRM / CELEBRATION / HIGH FIVE
// =============================================================================

function WelcomeModal({ user, onClose }) {
  const [step, setStep] = useState(0);
  const partner = user === 'George' ? 'Sammy' : 'George';
  const steps = [
    { emoji: '🌻', title: `Welcome to Homestead, ${user}`, body: `You and ${partner} share one garden. Tend it together — completing chores earns seeds, grows the garden, and unlocks your monthly £ pot.` },
    { emoji: '💷', title: 'The Monthly £ Pot', body: `Earn seeds throughout the month and your £ pot grows live. Hit the threshold and the full budget unlocks. Spend it on family treats from the Garden Centre. Unspent rolls into next month — anything not earned goes to your ISA.` },
    { emoji: '🌿', title: 'The Garden Picture', body: 'Tap any item in the picture — the playhouse, the lawnmower, the herb garden — to see its jobs. Completing them keeps that zone thriving.' },
    { emoji: '🔥', title: 'Streaks & Hot Streaks', body: `Daily streak — one of you tends each day. Hot streak — 3 jobs in one day gives you +25% seeds on the rest. Stack them up.` },
    { emoji: '🙌', title: 'High fives', body: 'When your partner ticks something off, send them a high five from the journal. It\'s what makes the partnership feel like a partnership.' },
  ];
  const current = steps[step];
  const isLast = step === steps.length - 1;
  return (
    <div className="welcome-backdrop">
      <div className="welcome-card">
        <div style={{padding:'1.5rem',textAlign:'center'}}>
          <div style={{fontSize:'4rem',marginBottom:'0.75rem'}}>{current.emoji}</div>
          <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'1.5rem',color:'#3D2A1F',marginBottom:'0.5rem'}}>{current.title}</h2>
          <p style={{color:'#5C5044',lineHeight:1.6}}>{current.body}</p>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'0.4rem',paddingBottom:'1rem'}}>
          {steps.map((_, i) => <span key={i} className={`dot ${i === step ? 'dot-active' : ''}`}/>)}
        </div>
        <div className="welcome-actions">
          {step > 0 && <button onClick={() => setStep(step - 1)} className="welcome-back">Back</button>}
          <button onClick={() => isLast ? onClose() : setStep(step + 1)} className="welcome-next">{isLast ? "Let's go" : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, danger, onCancel, onConfirm }) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-card" onClick={e => e.stopPropagation()}>
        <div style={{padding:'1.5rem'}}>
          <div style={{fontSize:'1.5rem',marginBottom:'0.75rem',color: danger ? '#DC2626' : '#5C5044'}}>{danger ? '⚠️' : '🌿'}</div>
          <p style={{color:'#3D2A1F',lineHeight:1.6}}>{message}</p>
        </div>
        <div className="confirm-actions">
          <button onClick={onCancel} className="welcome-back">Cancel</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger-flat' : 'welcome-next'}>{danger ? 'Yes, do it' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

function CelebrationOverlay({ celebration, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="celebrate-backdrop anim-celebrate" onClick={onClose}>
      <div className="celebrate-card">
        <div className="celebrate-confetti">
          {['🌸','🌼','🌷','🌻','🌿','✨'].map((e, i) => (
            <span key={i} className="anim-float" style={{top: `${10 + (i * 15) % 80}%`, left: `${(i * 23) % 90}%`, animationDelay: `${i * 0.2}s`}}>{e}</span>
          ))}
        </div>
        <div style={{position:'relative'}}>
          <div className="anim-float" style={{fontSize:'5rem',marginBottom:'0.75rem'}}>{celebration.emoji}</div>
          <p className="text-xs uppercase tracking-widest" style={{color:'#7E7268',marginBottom:'0.25rem'}}>
            {celebration.type === 'level' ? 'Level Up' : celebration.type === 'target' ? 'Target Reached' : 'Hot Streak!'}
          </p>
          <h2 style={{fontFamily:'Cormorant Garamond, serif',fontWeight:600,fontSize:'2.25rem',color:'#3D2A1F',marginBottom:'0.25rem'}}>{celebration.title}</h2>
          <p style={{fontFamily:'Caveat, cursive',fontSize:'1.25rem',color:'#5C5044',fontStyle:'italic',marginBottom:'0.75rem'}}>{celebration.subtitle}</p>
          <p style={{color:'#5C5044',fontSize:'0.875rem',lineHeight:1.6}}>{celebration.description}</p>
          <button onClick={onClose} className="welcome-next" style={{marginTop:'1.25rem',padding:'0.5rem 1.5rem',borderRadius:'9999px'}}>Wonderful</button>
        </div>
      </div>
    </div>
  );
}

function HighFiveAnimation() {
  return (
    <div className="hf-overlay">
      <div className="hf-burst">🙌</div>
    </div>
  );
}

// =============================================================================
// BOOT
// =============================================================================

const root = createRoot(document.getElementById('root'));
root.render(<Homestead/>);
