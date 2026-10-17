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

export const planPrompt = (i: { foods: { id: string; name: string }[]; preferences?: string; allergies?: string; lang: 'en' | 'el' }) =>
`Create meal ideas for a weekly healthy eating plan. Another program will scale the portions to the person's calorie target, so give typical grams for ONE adult portion and do not worry about total calories.
Use ONLY these ingredient ids (id = name): ${i.foods.map(f => `${f.id} = ${f.name}`).join('; ')}.
Give exactly: 5 breakfast, 6 lunch, 6 dinner, 4 snack ideas. Each idea has 2 to 6 ingredients, is practical home cooking, and differs clearly from the others. Prefer lean protein and plenty of vegetables.
${i.preferences ? `Preferences: ${i.preferences}.` : ''} ${i.allergies ? `Must avoid: ${i.allergies}.` : ''}
Write meal names in ${i.lang === 'el' ? 'Greek' : 'English'}.
Respond with ONLY a JSON object, no markdown, no commentary, exactly this shape:
{"meals":[{"slot":"breakfast"|"lunch"|"dinner"|"snack","name":string,"items":[{"food":string,"grams":number}]}]}`;
