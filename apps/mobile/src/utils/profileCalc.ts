import type {Profile} from '@fitmentor/shared';

// ponytail: duplicated from web/profile.ts calcTargets — move to shared when it grows
export function calcBmr(p: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'gender'>) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.gender === 'male' ? base + 5 : base - 161;
}

export function calcTdee(p: Profile) {
  const factor = 1.35 + Math.min(p.daysPerWeek, 6) * 0.045;
  return Math.round(calcBmr(p) * factor);
}

export function calcTargets(p: Profile) {
  const tdee = calcTdee(p);
  let calories = tdee;
  if (p.goal === 'fat_loss') calories = tdee - 400;
  else if (p.goal === 'muscle_gain') calories = tdee + 300;
  else if (p.goal === 'recomp') calories = tdee - 150;

  const proteinPerKg =
    p.goal === 'muscle_gain' || p.goal === 'strength' ? 1.8 : p.goal === 'fat_loss' ? 2.0 : 1.6;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {calories: Math.round(calories), protein, carbs, fat, tdee};
}
