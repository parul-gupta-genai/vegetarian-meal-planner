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
    diet_type = data.get('dietType', 'vegetarian')  # 'vegetarian', 'non-vegetarian', 'vegan'

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
        
        # Priority 0: Diet Type Filter (vegetarian, non-vegetarian, vegan)
        if diet_type == 'vegan':
            valid = [m for m in valid if m.get('diet') == 'vegan' or m.get('diet') == 'vegetarian']
        elif diet_type == 'vegetarian':
            valid = [m for m in valid if m.get('diet') != 'non-vegetarian']
        # non-vegetarian: no filter, show all

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

    return jsonify({
        "targetCalories": target_calories,
        "targetProtein": target_protein,
        "bmi": bmi,
        "context": context,
        "plan": plan
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
