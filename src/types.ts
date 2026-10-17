// Shared domain types. All energy in kcal, all mass in grams/kg internally (metric).
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Units = 'kg' | 'lb';
export type Theme = 'system' | 'light' | 'dark';
export type AiProviderId = 'gemini' | 'groq' | 'openrouter';
export type Lang = 'en' | 'el';
export type FoodSource = 'off' | 'usda' | 'custom' | 'recipe' | 'ai' | 'quick';

export interface Macros { kcal: number; protein: number; carbs: number; fat: number; }

export interface Profile {
  id: 'me';
  sex: Sex;
  birthDate: string;          // YYYY-MM-DD
  heightCm: number;
  weightKg: number;           // starting/current weight used for calcs
  goalWeightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  deficitPct: number;         // 0.15..0.25 when goal=lose (up to 0.30 for the adult aggressive cut)
  kcalAdjust?: number;        // 0, -100 or -200: extra daily deficit, adults only
  proteinGPerKg: number;      // 1.6..2.2
  fatPctOfRemaining?: number; // share of non-protein kcal from fat, default 0.35
  targets: Macros;            // computed and persisted
  updatedAt: number;
}

/** Nutrition per 100 g (or per 100 ml treated as g). */
export interface Food {
  id: string;                 // `${source}:${sourceId}` or uuid for custom
  source: FoodSource;
  sourceId?: string;
  name: string;
  brand?: string;
  barcode?: string;
  per100g: Macros;
  fiber100g?: number;
  servingG?: number;          // default serving size in grams
  servingLabel?: string;
  createdAt?: number;
}

export interface RecipeIngredient { foodId: string; grams: number; }
export interface Recipe {
  id: string; name: string; ingredients: RecipeIngredient[];
  totalCookedG?: number;      // if set, per100g derived from this weight
  servings: number; createdAt: number;
}

export interface LogEntry {
  id: string;
  date: string;               // YYYY-MM-DD local
  meal: MealType;
  foodId?: string;
  name: string;
  grams: number;
  macros: Macros;             // snapshot for this portion
  source: FoodSource;
  confidence?: number;        // 0..1 for AI estimates
  createdAt: number;
}

export interface WeightEntry { date: string; kg: number; createdAt: number; }

export interface Settings {
  id: 'settings';
  units: Units;
  theme: Theme;
  provider: AiProviderId;
  fallbackProvider?: AiProviderId;
  apiKeys: Partial<Record<AiProviderId | 'usda', string>>;
  models?: Partial<Record<AiProviderId, string>>;
  preferences?: string;
  allergies?: string;
  pantry?: string;
  lang?: Lang;                // undefined = follow device language
  waterGoalMl?: number;       // default 2500
  haptics?: boolean;          // default true
  fasting?: { enabled: boolean; targetH: number; startedAt?: number };
  notifications?: { enabled: boolean; weighTime: string; mealTime: string; backup: boolean };
  lastBackupAt?: number;      // epoch ms of last JSON export
  lastAdjustAt?: string;      // YYYY-MM-DD of last accepted/dismissed target suggestion
}

export interface WaterDay { date: string; taps: number[]; }              // ml per tap, oldest first
export interface ActivityDay { date: string; steps?: number; kcal?: number; }
export interface Measurement { id: string; date: string; waistCm?: number; chestCm?: number; hipsCm?: number; armCm?: number; thighCm?: number; createdAt: number; }
export interface ProgressPhoto { id: string; date: string; blob: Blob; createdAt: number; }
export interface TemplateItem { name: string; grams: number; macros: Macros; source: FoodSource; foodId?: string; }
export interface MealTemplate { id: string; name: string; meal: MealType; items: TemplateItem[]; createdAt: number; }

export interface ExportBundle {
  app: 'calorie-app'; version: number; exportedAt: string;
  profile?: Profile; settings?: Settings;
  foods: Food[]; recipes: Recipe[]; logs: LogEntry[]; weights: WeightEntry[];
  // v2 (all optional so v1 backups still import)
  water?: WaterDay[]; activity?: ActivityDay[]; measurements?: Measurement[]; templates?: MealTemplate[];
  photos?: { id: string; date: string; createdAt: number; dataUrl: string }[]; // only when the user opts in
}
