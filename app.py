import os
from flask import Flask, render_template, request, jsonify
import requests
import math
import random
import datetime
import json
import re

app = Flask(__name__)

def load_meals():
    try:
        with open('meals.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print("Error loading meals", e)
        return []

MEALS = load_meals()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/generate_plan', methods=['POST'])
def generate_plan():
    data = request.json
    # Extract data
    units = data.get('units', 'metric')
    age = int(data.get('age', 30))
    gender = data.get('gender', 'male')
    weight = float(data.get('weight', 70))
    height = float(data.get('height', 170))
    activityLevel = float(data.get('activity', 1.375))
    disease = data.get('disease', 'none')
    country = data.get('country', 'US').upper()
    city = data.get('city', 'London')
    birthdate = data.get('birthdate', '')
    anniversary = data.get('anniversary', '')
    diet_type = data.get('dietType', 'vegetarian')
    allergies = data.get('allergies', [])  # list e.g. ['lactose','nuts']

    # Math
    weight_kg = weight if units == 'metric' else weight * 0.453592
    height_cm = height if units == 'metric' else height * 2.54

    # BMR
    if gender == 'male':
        bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
    else:
        bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

    tdee = bmr * activityLevel
    bmi = weight_kg / ((height_cm / 100) ** 2)

    # Protein logic
    proteinMultiplier = 0.8
    if age < 18:
        proteinMultiplier = 1.2
    elif age >= 60:
        proteinMultiplier = 1.2
    elif activityLevel >= 1.55:
        proteinMultiplier = 1.4
    elif activityLevel >= 1.375:
        proteinMultiplier = 1.0
    
    if bmi >= 25:
        proteinMultiplier += 0.2
    
    target_protein = round(weight_kg * proteinMultiplier)

    # Adjustments
    target_calories = tdee
    if age >= 18:
        if bmi < 18.5:
            target_calories += 300
        elif bmi >= 25:
            target_calories -= 500

    target_calories = math.floor(target_calories)
    
    weather_type = 'all'
    weather_desc = 'Unknown'
    temp = 20
    icon = 'ri-cloud-off-line'

    try:
        geo_res = requests.get(f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json").json()
        if geo_res.get('results'):
            lat = geo_res['results'][0]['latitude']
            lon = geo_res['results'][0]['longitude']
            w_res = requests.get(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true").json()
            if 'current_weather' in w_res:
                temp = w_res['current_weather']['temperature']
                weather_desc = "Clear"
                icon = "ri-sun-line"
                if temp > 25:
                    weather_type = 'hot'
                elif temp < 15:
                    weather_type = 'cold'
                    weather_desc = "Cold"
                    icon = "ri-snowy-line"
                else:
                    weather_type = 'warm'
    except:
        pass

    today_str = datetime.datetime.now().strftime("%m-%d")
    festival = None
    if birthdate and birthdate[5:] == today_str:
        festival = "Birthday"
    elif anniversary and anniversary[5:] == today_str:
        festival = "Anniversary"
    
    context = {
        "weather": {"type": weather_type, "temp": temp, "desc": weather_desc, "icon": icon},
        "festival": festival,
        "country": country,
        "disease": disease
    }

    # Personal event tags that should ONLY show on those special days
    PERSONAL_EVENT_TAGS = {'birthday', 'anniversary', 'birthday special', 'anniversary special'}

    # Now filter meals
    def filter_meals(m_type):
        valid = [m for m in MEALS if m.get('type') == m_type]
        
        # Priority 0: Diet Type Filter - STRICT
        if diet_type == 'vegan':
            # Vegan: only meals tagged as 'vegan'
            vegan_meals = [m for m in valid if m.get('diet') == 'vegan']
            valid = vegan_meals if vegan_meals else valid  # fallback if no vegan meals
        elif diet_type == 'non-vegetarian':
            # Non-veg: only meals tagged as 'non-vegetarian'
            nonveg_meals = [m for m in valid if m.get('diet') == 'non-vegetarian']
            valid = nonveg_meals if nonveg_meals else valid  # fallback if no non-veg meals
        else:
            # Vegetarian (default): exclude non-vegetarian meals
            valid = [m for m in valid if m.get('diet') != 'non-vegetarian']

        # Allergen filter
        if allergies:
            for allergen in allergies:
                filtered = [m for m in valid if allergen not in m.get('allergens', [])]
                if filtered: valid = filtered  # only apply if it doesn't wipe the pool

        if disease != 'none':
            safe = [m for m in valid if disease in m.get('safeFor', [])]\
            
            if safe: valid = safe
        
        # Festival logic
        if festival:
            # Boost: prefer meals tagged for this festival
            fest_matches = [m for m in valid if festival.lower() in [f.lower() for f in m.get('festivals', [])]]
            if fest_matches: valid = fest_matches
        else:
            # No festival today — EXCLUDE meals that are ONLY for personal events (Birthday/Anniversary)
            # A meal is "personal event only" if ALL its festival tags are personal event tags
            def is_personal_event_only(m):
                tags = {f.lower() for f in m.get('festivals', [])}
                return bool(tags) and tags.issubset(PERSONAL_EVENT_TAGS)
            valid = [m for m in valid if not is_personal_event_only(m)]
        
        # Country
        country_matches = [m for m in valid if country in m.get('countries', [])]
        if country_matches: valid = country_matches

        # Weather
        w_matches = [m for m in valid if weather_type in m.get('weather', []) or 'all' in m.get('weather', [])]
        if w_matches: valid = w_matches

        return valid if valid else [m for m in MEALS if m.get('type') == m_type]

    b_meals = filter_meals('Breakfast')
    l_meals = filter_meals('Lunch')
    d_meals = filter_meals('Dinner')

    def get_closest(meal_list, target):
        if not meal_list:
            return None
        sorted_meals = sorted(meal_list, key=lambda x: abs(x['cals'] - target))
        top_3 = sorted_meals[:3]
        return random.choice(top_3)

    target_b = target_calories * 0.25
    target_l = target_calories * 0.35
    target_d = target_calories * 0.40

    breakfast = get_closest(b_meals, target_b)
    lunch = get_closest(l_meals, target_l)
    dinner = get_closest(d_meals, target_d)

    def scale(m, mult):
        if not m: return None
        mult = max(0.5, min(1.8, mult))
        m_copy = dict(m)
        m_copy['scaledCals'] = round(m['cals'] * mult)
        m_copy['scaledProtein'] = round(m['protein'] * mult)
        m_copy['scaledCarbs'] = round(m['carbs'] * mult)
        m_copy['scaledFat'] = round(m['fat'] * mult)
        m_copy['multiplier'] = mult
        return m_copy

    plan = {
        "breakfast": scale(breakfast, target_b / breakfast['cals']) if breakfast else None,
        "lunch": scale(lunch, target_l / lunch['cals']) if lunch else None,
        "dinner": scale(dinner, target_d / dinner['cals']) if dinner else None
    }

    # ===== DIETICIAN HEALTH ANALYSIS =====
    # Collect totals from plan
    total_cals = sum(p['scaledCals'] for p in plan.values() if p)
    total_prot = sum(p['scaledProtein'] for p in plan.values() if p)
    total_carbs = sum(p['scaledCarbs'] for p in plan.values() if p)
    total_fat = sum(p['scaledFat'] for p in plan.values() if p)
    # Estimated fiber and sodium from meals (use defaults if not present)
    total_fiber = sum(p.get('fiber', round(p['scaledCarbs'] * 0.08)) for p in plan.values() if p)
    total_sodium = sum(p.get('sodium', round(p['scaledCals'] * 0.65)) for p in plan.values() if p)

    # Macro ratios (% of calories)
    macro_cals = (total_carbs * 4) + (total_prot * 4) + (total_fat * 9)
    carb_pct = round((total_carbs * 4 / macro_cals) * 100) if macro_cals else 0
    prot_pct = round((total_prot * 4 / macro_cals) * 100) if macro_cals else 0
    fat_pct  = round((total_fat  * 9 / macro_cals) * 100) if macro_cals else 0

    # Targets
    fiber_target = 38 if gender == 'male' else 25
    sodium_target = 1500 if disease == 'Hypertension' else 2300
    hydration_l = round(weight_kg * 0.035, 1)  # 35 ml per kg

    # BMI danger level
    bmi_danger = None
    bmi_alert_type = 'danger'
    if bmi < 16:
        bmi_danger = f"⚠️ Severely Underweight (BMI {bmi:.1f}). Please consult a doctor immediately."
    elif bmi < 18.5:
        bmi_danger = f"⚠️ Underweight (BMI {bmi:.1f}). A caloric surplus plan has been applied."
        bmi_alert_type = 'warning'
    elif bmi >= 40:
        bmi_danger = f"⚠️ Severely Obese (BMI {bmi:.1f}). Please consult a doctor or dietician."
    elif bmi >= 30:
        bmi_danger = f"⚠️ Obese (BMI {bmi:.1f}). A caloric deficit plan has been applied."
        bmi_alert_type = 'warning'

    # Weight timeline (based on caloric diff)
    caloric_diff = abs(target_calories - tdee)
    timeline_val = "–"
    timeline_msg = "You are at maintenance"
    if bmi < 18.5 and caloric_diff > 0:
        weeks_to_goal = round(((18.5 * (height_cm/100)**2) - weight_kg) / 0.5 * 1, 1)
        timeline_val = f"{max(1, weeks_to_goal):.0f} wks"
        timeline_msg = "to reach healthy BMI at +300 kcal/day"
    elif bmi >= 25 and caloric_diff > 0:
        kg_to_lose = weight_kg - (24.9 * (height_cm/100)**2)
        weeks_to_goal = round(kg_to_lose / 0.5)
        timeline_val = f"{max(1, weeks_to_goal)} wks"
        timeline_msg = f"to lose {kg_to_lose:.1f} kg at -500 kcal/day"

    # Health Score (0-100)
    score = 100
    score_breakdown = []

    # BMI check (-20 for danger zones)
    if bmi < 16 or bmi >= 40:
        score -= 20; score_breakdown.append({"label": "BMI Danger Zone", "type": "bad"})
    elif bmi < 18.5 or bmi >= 30:
        score -= 10; score_breakdown.append({"label": "BMI Concern", "type": "warn"})
    else:
        score_breakdown.append({"label": "Healthy BMI", "type": "good"})

    # Macro ratios check
    if 45 <= carb_pct <= 65 and 15 <= prot_pct <= 35 and 20 <= fat_pct <= 35:
        score_breakdown.append({"label": "Balanced Macros", "type": "good"})
    else:
        score -= 10; score_breakdown.append({"label": "Macro Imbalance", "type": "warn"})

    # Protein adequacy
    if total_prot >= target_protein:
        score_breakdown.append({"label": "Protein Met", "type": "good"})
    else:
        score -= 10; score_breakdown.append({"label": "Low Protein", "type": "warn"})

    # Fiber
    if total_fiber >= fiber_target * 0.8:
        score_breakdown.append({"label": "Good Fiber", "type": "good"})
    else:
        score -= 5; score_breakdown.append({"label": "Low Fiber", "type": "warn"})

    # Sodium
    if total_sodium <= sodium_target:
        score_breakdown.append({"label": "Sodium OK", "type": "good"})
    else:
        score -= 5; score_breakdown.append({"label": "High Sodium", "type": "warn"})

    score = max(0, score)
    if score >= 80: score_msg = "Excellent! This is a well-balanced, dietician-approved meal plan."
    elif score >= 60: score_msg = "Good plan with a few areas to improve."
    else: score_msg = "This plan needs attention. Review the alerts below."

    # Health tips
    tips = []
    if age < 18:
        tips.append({"type": "info", "icon": "👶", "text": f"Growing child aged {age}: Higher protein & calcium are critical. Include dairy or fortified foods."})
    if age >= 60:
        tips.append({"type": "info", "icon": "👴", "text": "Seniors (60+): Protein needs are higher to prevent muscle loss. Vitamin D & B12 supplements are often recommended."})
    if diet_type == 'vegan':
        tips.append({"type": "warn", "icon": "🌿", "text": "Vegan diet: Supplement Vitamin B12, Vitamin D, Iron, and Omega-3 (algae-based) as these can be deficient."})
    if diet_type == 'vegetarian':
        tips.append({"type": "info", "icon": "🌱", "text": "Vegetarian diet: Ensure adequate Iron (legumes, spinach) and Vitamin B12 (dairy, eggs, or supplements)."})

    # Medical condition-specific tips
    if disease == 'Diabetes':
        tips.append({"type": "warn", "icon": "🩸", "text": "Diabetes: Prioritize low GI foods (oats, lentils, legumes). Avoid refined sugar & white rice. Eat 5-6 small meals to stabilize blood sugar."})
    elif disease == 'Hypertension':
        tips.append({"type": "warn", "icon": "❤️", "text": f"Hypertension: Sodium strictly limited to {sodium_target}mg/day. Avoid pickles, papad, chips, processed foods. Include potassium-rich foods (banana, sweet potato)."})
    elif disease == 'Celiac':
        tips.append({"type": "warn", "icon": "🌾", "text": "Celiac Disease: Strictly avoid all gluten (wheat, barley, rye). Opt for rice, quinoa, millets, and certified gluten-free products."})
    elif disease == 'LiverDisease':
        tips.append({"type": "bad", "icon": "🫀", "text": "Liver Disease: Avoid high-fat, fried, and processed foods. Keep protein moderate (0.8–1g/kg). Avoid alcohol. Focus on complex carbs and fresh vegetables."})
        tips.append({"type": "info", "icon": "🥦", "text": "Liver-friendly foods: Include broccoli, garlic, turmeric, beets, and green tea. Avoid red meat (already avoided) and raw shellfish."})
    elif disease == 'KidneyDisease':
        tips.append({"type": "bad", "icon": "🫘", "text": "Kidney Disease (CKD): Strictly limit Protein, Potassium, Phosphorus & Sodium. Avoid high-potassium foods (bananas, tomatoes, oranges, potatoes) and dairy in excess."})
        tips.append({"type": "warn", "icon": "💧", "text": "CKD: Fluid restriction may apply. Consult your nephrologist for exact daily fluid intake limit. Never self-medicate dietary changes with CKD."})
    elif disease == 'Pregnancy':
        tips.append({"type": "info", "icon": "🤰", "text": "Pregnancy (1st Trim): Focus on folate-rich foods (spinach, lentils, broccoli) and Vitamin B6. Take a prenatal supplement with folic acid (400–800mcg/day)."})
        tips.append({"type": "warn", "icon": "🚫", "text": "Pregnancy: Avoid raw/undercooked foods, unpasteurized dairy, excessive caffeine. Iron needs increase — include lentils, fortified cereals and pair with Vitamin C."})
        tips.append({"type": "good", "icon": "🥛", "text": "Pregnancy: Calcium needs are ~1000mg/day. Include low-fat dairy, sesame seeds, and leafy greens. Caloric needs increase by ~300 kcal in 2nd & 3rd trimester."})
    elif disease == 'Menopause':
        tips.append({"type": "info", "icon": "🌡️", "text": "Menopause: Calcium & Vitamin D are critical (bones weaken post-menopause). Include dairy, fortified foods and get sunlight. Aim for 1200mg Calcium/day."})
        tips.append({"type": "info", "icon": "🌱", "text": "Menopause: Phytoestrogen-rich foods (soy, flaxseed, lentils) may help ease hot flashes. Reduce caffeine and spicy foods which can trigger symptoms."})
    elif disease == 'KidsGrowth':
        tips.append({"type": "info", "icon": "📏", "text": "Kids Growth: Calcium (dairy, broccoli) & Vitamin D (sunlight, fortified foods) are essential for bone growth. Don't restrict fat unnecessarily — it supports brain development."})
        tips.append({"type": "good", "icon": "🥛", "text": "Kids Growth: Ensure 3 servings of dairy/day for calcium. Include iron-rich foods (lentils, spinach) to prevent anaemia. Avoid processed sugary snacks."})
    elif disease == 'Arthritis':
        tips.append({"type": "info", "icon": "🦵", "text": "Arthritis: Focus on anti-inflammatory foods — turmeric, ginger, omega-3 rich foods (flaxseed, walnuts), colorful vegetables. Avoid processed and fried foods."})
        tips.append({"type": "warn", "icon": "⚖️", "text": "Arthritis: Maintaining a healthy weight reduces joint stress significantly. A caloric deficit if overweight, combined with low-impact exercise (yoga, swimming) is recommended."})
    elif disease == 'MentalHealth':
        tips.append({"type": "info", "icon": "🧠", "text": "Mental Health: Gut-brain axis is key. Include probiotic-rich foods (yogurt, kefir, fermented foods) and prebiotic fibers (oats, bananas, garlic) for mood support."})
        tips.append({"type": "info", "icon": "🐟", "text": "Mental Health: Omega-3 fatty acids (walnuts, flaxseed, chia seeds) support brain health and may reduce depression symptoms. Magnesium (dark leafy greens) helps with anxiety."})
        tips.append({"type": "good", "icon": "☀️", "text": "Mental Health: Vitamin D deficiency is linked to depression. Get at least 15 min of sunlight daily. Include tryptophan-rich foods (nuts, seeds, dairy) to boost serotonin."})
    elif disease == 'Obesity':
        tips.append({"type": "warn", "icon": "⚖️", "text": f"Obesity (BMI {bmi:.1f}): A caloric deficit of 500 kcal/day has been applied. Focus on high-volume, low-calorie foods — vegetables, salads, soups, and lean protein."})
        tips.append({"type": "info", "icon": "🏃", "text": "Obesity: Combine diet with at least 300 min of moderate exercise per week. Strength training helps preserve muscle during weight loss. Avoid crash diets."})
    elif disease == 'Cancer':
        tips.append({"type": "bad", "icon": "🎗️", "text": "Cancer: Nutrition needs vary by cancer type and treatment stage. This plan is a general guide. ALWAYS follow your oncologist's and registered dietician's specific recommendations."})
        tips.append({"type": "info", "icon": "🥦", "text": "Cancer: During treatment, focus on antioxidant-rich foods (berries, green tea, cruciferous vegetables). High protein helps maintain muscle. If appetite is low, eat small frequent meals."})
        tips.append({"type": "warn", "icon": "🚫", "text": "Cancer: Avoid alcohol, processed meats, and charred foods. Sugar fuels cancer cell growth — minimize refined sugars and prioritize whole, plant-based foods."})
    elif disease == 'Thyroid_Hypo':
        tips.append({"type": "info", "icon": "🦋", "text": "Hypothyroidism: Include iodine-rich foods (seaweed, iodized salt) and selenium-rich foods (brazil nuts, sunflower seeds, mushrooms). Take thyroid medication on an empty stomach."})
        tips.append({"type": "warn", "icon": "🥦", "text": "Hypothyroidism: Limit raw cruciferous vegetables (cabbage, broccoli, cauliflower) in large quantities as they can inhibit thyroid function. Cooking them reduces this effect."})
    elif disease == 'Thyroid_Hyper':
        tips.append({"type": "info", "icon": "🦋", "text": "Hyperthyroidism: AVOID iodine-rich foods (seaweed, iodized salt, dairy in excess) as iodine stimulates the thyroid. Eat calcium-rich foods to protect bones."})
        tips.append({"type": "warn", "icon": "☕", "text": "Hyperthyroidism: Avoid stimulants like caffeine which worsen anxiety and palpitations. Cruciferous vegetables (broccoli, cabbage) can actually HELP reduce thyroid activity."})

    tips.append({"type": "good", "icon": "💧", "text": f"Drink at least {hydration_l}L of water daily based on your body weight ({weight_kg:.0f}kg × 35ml/kg)."})
    if bmi >= 25 and disease not in ['Obesity', 'Cancer', 'KidneyDisease']:
        tips.append({"type": "info", "icon": "🏃", "text": "For effective weight loss, combine your calorie deficit with at least 150 min of moderate exercise per week."})

    health_analysis = {
        "score": score,
        "scoreMsg": score_msg,
        "scoreBreakdown": score_breakdown,
        "bmiDanger": bmi_danger,
        "bmiAlertType": bmi_alert_type,
        "carbPct": carb_pct,
        "protPct": prot_pct,
        "fatPct": fat_pct,
        "totalFiber": total_fiber,
        "fiberTarget": fiber_target,
        "totalSodium": total_sodium,
        "sodiumTarget": sodium_target,
        "hydrationL": hydration_l,
        "timelineVal": timeline_val,
        "timelineMsg": timeline_msg,
        "tips": tips
    }

    return jsonify({
        "targetCalories": target_calories,
        "targetProtein": target_protein,
        "bmi": bmi,
        "tdee": round(tdee),
        "context": context,
        "plan": plan,
        "healthAnalysis": health_analysis
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
