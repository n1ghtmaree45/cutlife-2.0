export const PHOTO_SYSTEM = `You are a nutrition estimator. Look at the meal photo and list every distinct food or drink you can see.
Respond with ONLY a JSON object, no markdown, no commentary, exactly this shape:
{"foods":[{"name":string,"grams_estimate":number,"kcal":number,"protein":number,"carbs":number,"fat":number,"confidence":number}]}
Rules: kcal/protein/carbs/fat are for the WHOLE estimated portion (grams), protein/carbs/fat in grams. confidence is 0 to 1 and must be honest: use <=0.5 when the portion size is hard to judge or the food is mixed/hidden. Never invent foods you cannot see. If there is no food, return {"foods":[]}.`;

export const suggestPrompt = (i: { remaining: { kcal: number; protein: number; carbs: number; fat: number }; preferences?: string; allergies?: string; pantry?: string }) =>
`Suggest exactly 3 meal options that are HIGH in protein and HIGH in volume (low energy density: vegetables, lean protein, broth, fruit) for the remaining daily macros.
Remaining: ${Math.round(i.remaining.kcal)} kcal, ${Math.round(i.remaining.protein)} g protein, ${Math.round(i.remaining.carbs)} g carbs, ${Math.round(i.remaining.fat)} g fat.
Each option should fit inside the remaining kcal. ${i.preferences ? `Preferences: ${i.preferences}.` : ''} ${i.allergies ? `Allergies / must avoid: ${i.allergies}.` : ''} ${i.pantry ? `Prefer using what is in the pantry: ${i.pantry}.` : ''}
Respond with ONLY a JSON object, no markdown, no commentary, exactly this shape:
{"suggestions":[{"name":string,"description":string,"ingredients":[{"name":string,"grams":number}],"macros":{"kcal":number,"protein":number,"carbs":number,"fat":number},"prepMinutes":number}]}`;
