document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const formSection = document.getElementById('formSection');
    const resultsSection = document.getElementById('resultsSection');
    const plannerForm = document.getElementById('plannerForm');
    const backBtn = document.getElementById('backBtn');
    
    // Inputs
    const unitRadios = document.getElementsByName('units');
    const weightLabel = document.getElementById('weightLabel');
    const heightLabel = document.getElementById('heightLabel');
    const ageInput = document.getElementById('age');
    const genderInput = document.getElementById('gender');
    const weightInput = document.getElementById('weight');
    const heightInput = document.getElementById('height');
    const activityInput = document.getElementById('activity');
    const countryInput = document.getElementById('country');
    const cityInput = document.getElementById('city');
    const diseaseInput = document.getElementById('disease');
    const birthdateInput = document.getElementById('birthdate');
    const anniversaryInput = document.getElementById('anniversary');
    const apiKeyInput = document.getElementById('apiKey');
    
    // Output Elements
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherDesc = document.getElementById('weatherDesc');
    const festivalName = document.getElementById('festivalName');
    const targetCaloriesEl = document.getElementById('targetCalories');
    const targetProteinValEl = document.getElementById('targetProteinVal');
    const bmiValEl = document.getElementById('bmiVal');
    const bmiCategoryEl = document.getElementById('bmiCategory');
    const mealPlanContainer = document.querySelector('.meal-plan');
    const mealCardTemplate = document.getElementById('mealCardTemplate');
    
    // Macro Elements
    const totalCalsEl = document.getElementById('totalCals');
    const totalProteinEl = document.getElementById('totalProtein');
    const totalCarbsEl = document.getElementById('totalCarbs');
    const totalFatEl = document.getElementById('totalFat');

    let currentUnits = 'metric';
    
    // Event Listeners
    unitRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentUnits = e.target.value;
            if (currentUnits === 'metric') {
                weightLabel.textContent = 'kg';
                heightLabel.textContent = 'cm';
                weightInput.placeholder = 'e.g. 70';
                heightInput.placeholder = 'e.g. 175';
            } else {
                weightLabel.textContent = 'lbs';
                heightLabel.textContent = 'in';
                weightInput.placeholder = 'e.g. 150';
                heightInput.placeholder = 'e.g. 68';
            }
        });
    });

    backBtn.addEventListener('click', () => {
        resultsSection.classList.add('hidden');
        formSection.classList.remove('hidden');
    });

    plannerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('generateBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>Processing...</span><i class="ri-loader-4-line ri-spin"></i>';
        btn.disabled = true;

        try {
            // 1. Calculate Biometrics
            let weightKg = parseFloat(weightInput.value);
            let heightCm = parseFloat(heightInput.value);
            const age = parseInt(ageInput.value);
            const gender = genderInput.value;
            const activityLevel = parseFloat(activityInput.value);

            if (currentUnits === 'imperial') {
                weightKg = weightKg * 0.453592; // lbs to kg
                heightCm = heightCm * 2.54;     // inches to cm
            }

            // Mifflin-St Jeor Equation
            let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
            bmr = gender === 'male' ? bmr + 5 : bmr - 161;
            
            const tdee = Math.round(bmr * activityLevel);
            
            // Calculate BMI for healthy diet goals
            const heightM = heightCm / 100;
            const bmi = weightKg / (heightM * heightM);
            
            let targetCalories = tdee;
            let goalText = "Maintenance Target";
            let bmiText = "Normal Weight";
            
            if (age < 18) {
                // Pediatric Logic
                bmiText = "Pediatric BMI (Consult Chart)";
                goalText = "Growing Child Maintenance";
            } else {
                // Adult Logic
                if (bmi >= 25) {
                    targetCalories = tdee - 500; // Caloric deficit for weight loss
                    goalText = "Weight Loss Target";
                    bmiText = bmi >= 30 ? "Obese" : "Overweight";
                } else if (bmi < 18.5) {
                    targetCalories = tdee + 300; // Caloric surplus for healthy weight gain
                    goalText = "Weight Gain Target";
                    bmiText = "Underweight";
                }
            }
            
            if (bmiValEl) bmiValEl.textContent = bmi.toFixed(1);
            if (bmiCategoryEl) bmiCategoryEl.textContent = bmiText;
            
            // Safety limits
            if (age >= 18) {
                const safeMin = gender === 'male' ? 1500 : 1200;
                if (targetCalories < safeMin) targetCalories = safeMin;
            } else {
                const childMin = 1000;
                if (targetCalories < childMin) targetCalories = childMin;
            }
            
            // Calculate Protein Target based on Age, Weight, and Activity
            let proteinMultiplier = 0.8;
            if (age < 18) proteinMultiplier = 1.2; // Growing kids need more protein per kg
            else if (age >= 60) proteinMultiplier = 1.2; // Increase protein for aging
            else if (activityLevel >= 1.55) proteinMultiplier = 1.4;
            else if (activityLevel >= 1.375) proteinMultiplier = 1.0;
            
            if (bmi >= 25) proteinMultiplier += 0.2; // Extra protein helps preserve muscle in deficit
            
            const targetProtein = Math.round(weightKg * proteinMultiplier);
            if (targetProteinValEl) targetProteinValEl.textContent = `${targetProtein} g`;

            targetCaloriesEl.textContent = `${targetCalories} kcal`;
            targetCaloriesEl.nextElementSibling.textContent = goalText;

            // 2. Fetch Context Data (Weather & Holidays)
            const city = cityInput.value.trim();
            const country = countryInput.value.trim().toUpperCase();
            const disease = diseaseInput.value;
            const birthdate = birthdateInput ? birthdateInput.value : '';
            const anniversary = anniversaryInput ? anniversaryInput.value : '';
            
            const context = await getContext(city, country);
            context.disease = disease;
            
            // Check for personal events (MM-DD)
            const today = new Date();
            const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            
            if (birthdate && birthdate.substring(5) === todayStr) {
                context.festival = "Birthday";
            } else if (anniversary && anniversary.substring(5) === todayStr) {
                context.festival = "Anniversary";
            }
            
            // 3. Generate Meal Plan (Static or Dynamic)
            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            let mealPlan;
            if (apiKey) {
                btn.innerHTML = '<span>Fetching Live Recipes...</span><i class="ri-loader-4-line spin"></i>';
                mealPlan = await generateLiveMealPlan(apiKey, targetCalories, context);
            } else {
                mealPlan = generateMealPlan(targetCalories, context);
            }
            
            // 4. Render Results
            renderResults(mealPlan, context);

            // Switch view
            formSection.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch (error) {
            console.error(error);
            alert("An error occurred while generating your plan. Please check your inputs.");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    async function getContext(city, countryCode) {
        let weather = { temp: 20, type: 'all', desc: 'Unknown', isError: true };
        let festival = null;

        // Try getting geocoding for weather
        try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
            const geoData = await geoRes.json();
            
            if (geoData.results && geoData.results.length > 0) {
                const lat = geoData.results[0].latitude;
                const lon = geoData.results[0].longitude;
                
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                const weatherData = await weatherRes.json();
                
                if (weatherData.current_weather) {
                    const temp = weatherData.current_weather.temperature;
                    let type = 'all';
                    if (temp < 15) type = 'cold';
                    else if (temp > 25) type = 'hot';
                    else if (temp >= 15 && temp <= 25) type = 'warm';

                    weather = {
                        temp: temp,
                        type: type,
                        desc: getWeatherDescription(weatherData.current_weather.weathercode),
                        icon: getWeatherIcon(weatherData.current_weather.weathercode),
                        isError: false
                    };
                }
            }
        } catch (e) {
            console.error("Weather fetch failed:", e);
        }

        // Try getting holidays
        try {
            // Nager.date free API
            const today = new Date();
            const year = today.getFullYear();
            const holRes = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
            
            if (holRes.ok) {
                const holidays = await holRes.json();
                const todayStr = today.toISOString().split('T')[0];
                const todayHoliday = holidays.find(h => h.date === todayStr);
                
                if (todayHoliday) {
                    festival = todayHoliday.name;
                }
            }
        } catch (e) {
            console.error("Holiday fetch failed:", e);
        }

        return { weather, festival, country: countryCode };
    }

    async function fetchSpoonacularMeal(apiKey, type, maxCals, context) {
        let intolerances = '';
        if (context.disease === 'Celiac') intolerances = '&intolerances=gluten';
        // Note: We can add more complex mappings here, but diet=vegetarian is baseline
        
        const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${apiKey}&diet=vegetarian${intolerances}&type=${type}&maxCalories=${Math.floor(maxCals + 100)}&addRecipeNutrition=true&number=3&sort=random`;
        
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Spoonacular API Error');
        }
        const data = await res.json();
        
        if (!data.results || data.results.length === 0) {
            throw new Error(`No ${type} recipes found from Spoonacular.`);
        }
        
        const recipe = data.results[0];
        const nutrients = recipe.nutrition.nutrients;
        
        const getNutrient = (name) => {
            const n = nutrients.find(x => x.name.toLowerCase() === name.toLowerCase());
            return n ? n.amount : 0;
        };

        return {
            title: recipe.title,
            desc: `Ready in ${recipe.readyInMinutes} mins. (Live Recipe)`,
            cals: getNutrient('calories'),
            protein: getNutrient('protein'),
            carbs: getNutrient('carbohydrates'),
            fat: getNutrient('fat'),
            liveImage: recipe.image
        };
    }

    async function generateLiveMealPlan(apiKey, targetCals, context) {
        const targetB = targetCals * 0.25;
        const targetL = targetCals * 0.35;
        const targetD = targetCals * 0.40;

        try {
            const [breakfast, lunch, dinner] = await Promise.all([
                fetchSpoonacularMeal(apiKey, 'breakfast', targetB, context),
                fetchSpoonacularMeal(apiKey, 'main course', targetL, context),
                fetchSpoonacularMeal(apiKey, 'main course', targetD, context)
            ]);

            const bMult = targetB / (breakfast.cals || targetB);
            const lMult = targetL / (lunch.cals || targetL);
            const dMult = targetD / (dinner.cals || targetD);

            return {
                breakfast: scaleMeal(breakfast, bMult),
                lunch: scaleMeal(lunch, lMult),
                dinner: scaleMeal(dinner, dMult)
            };
        } catch (e) {
            console.error(e);
            alert("Failed to fetch live recipes: " + e.message + "\nFalling back to local database.");
            return generateMealPlan(targetCals, context);
        }
    }

    function generateMealPlan(targetCals, context) {
        // Simple logic: Breakfast ~25%, Lunch ~35%, Dinner ~40%
        const targetB = targetCals * 0.25;
        const targetL = targetCals * 0.35;
        const targetD = targetCals * 0.40;

        const bMeals = filterMeals('Breakfast', context);
        const lMeals = filterMeals('Lunch', context);
        const dMeals = filterMeals('Dinner', context);

        // Pick meal closest to target calories
        const breakfast = getClosestMeal(bMeals, targetB);
        const lunch = getClosestMeal(lMeals, targetL);
        const dinner = getClosestMeal(dMeals, targetD);

        // Adjust quantities based on calorie target
        const bMult = targetB / breakfast.cals;
        const lMult = targetL / lunch.cals;
        const dMult = targetD / dinner.cals;

        return {
            breakfast: scaleMeal(breakfast, bMult),
            lunch: scaleMeal(lunch, lMult),
            dinner: scaleMeal(dinner, dMult)
        };
    }

    function filterMeals(type, context) {
        let meals = mealsDB.filter(m => m.type === type);
        
        // Priority 0: Medical Condition Hard Filter
        if (context.disease && context.disease !== 'none') {
            const safeMeals = meals.filter(m => m.safeFor && m.safeFor.includes(context.disease));
            if (safeMeals.length > 0) {
                meals = safeMeals;
            } else {
                console.warn(`No ${type} meals found safe for ${context.disease}, falling back to all`);
            }
        }
        
        // Priority 1: Festival match
        if (context.festival) {
            const festMeals = meals.filter(m => m.festivals.some(f => context.festival.toLowerCase().includes(f.toLowerCase())));
            if (festMeals.length > 0) return festMeals;
        }

        // Priority 2: Country match
        if (context.country) {
            const countryMeals = meals.filter(m => m.countries && m.countries.includes(context.country));
            if (countryMeals.length > 0) {
                // If there are country specific meals, we filter our pool down to them
                meals = countryMeals;
            }
        }

        // Priority 3: Weather match
        const weatherType = context.weather.type;
        const weatherMeals = meals.filter(m => m.weather.includes(weatherType) || m.weather.includes('all'));
        
        if (weatherMeals.length > 0) return weatherMeals;
        
        return meals; // Fallback to all of that type
    }

    function getClosestMeal(meals, target) {
        // Sort by how close they are to the target calories
        const sorted = [...meals].sort((a, b) => Math.abs(a.cals - target) - Math.abs(b.cals - target));
        
        // Pick randomly from the top 3 closest meals to introduce variety on every click
        const topN = sorted.slice(0, 3);
        return topN[Math.floor(Math.random() * topN.length)];
    }

    function scaleMeal(meal, multiplier) {
        // Clamp multiplier so portions don't get too crazy (e.g., between 0.5 and 1.5)
        const m = Math.max(0.5, Math.min(1.8, multiplier));
        return {
            ...meal,
            scaledCals: Math.round(meal.cals * m),
            scaledProtein: Math.round(meal.protein * m),
            scaledCarbs: Math.round(meal.carbs * m),
            scaledFat: Math.round(meal.fat * m),
            multiplier: m
        };
    }

    function renderResults(plan, context) {
        // Render Weather
        if (!context.weather.isError) {
            weatherTemp.textContent = `${context.weather.temp}°C`;
            weatherDesc.textContent = context.weather.desc;
            weatherIcon.className = context.weather.icon;
        } else {
            weatherTemp.textContent = '--';
            weatherDesc.textContent = 'Weather Unavailable';
            weatherIcon.className = 'ri-cloud-off-line';
        }

        // Render Festival
        if (context.festival) {
            festivalName.textContent = context.festival;
        } else {
            festivalName.textContent = "No Festival Today";
        }

        // Render Meals
        mealPlanContainer.innerHTML = '';
        let tCals = 0, tProt = 0, tCarb = 0, tFat = 0;

        ['breakfast', 'lunch', 'dinner'].forEach(mealTime => {
            const meal = plan[mealTime];
            const node = mealCardTemplate.content.cloneNode(true);
            
            if (meal.liveImage) {
                const imgEl = node.querySelector('.meal-live-image');
                const iconEl = node.querySelector('.default-icon');
                imgEl.src = meal.liveImage;
                imgEl.style.display = 'block';
                iconEl.style.display = 'none';
            }
            
            node.querySelector('.meal-type').textContent = meal.type || mealTime.charAt(0).toUpperCase() + mealTime.slice(1);
            node.querySelector('.meal-title').textContent = meal.title;
            
            let portionText = "";
            if (meal.multiplier > 1.2) portionText = " (Large Portion)";
            else if (meal.multiplier < 0.8) portionText = " (Small Portion)";
            
            node.querySelector('.meal-desc').textContent = meal.desc + portionText;
            
            if (node.querySelector('.m-qty')) {
                node.querySelector('.m-qty').textContent = meal.multiplier.toFixed(1);
            }
            
            node.querySelector('.m-cals').textContent = meal.scaledCals;
            node.querySelector('.m-prot').textContent = meal.scaledProtein;
            node.querySelector('.m-carbs').textContent = meal.scaledCarbs;
            node.querySelector('.m-fat').textContent = meal.scaledFat;

            // Add Tags
            const tagsDiv = node.querySelector('.meal-tags');
            if (context.festival && meal.festivals && meal.festivals.some(f => context.festival.toLowerCase().includes(f.toLowerCase()))) {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
                tag.style.color = '#fcd34d';
                tag.textContent = 'Festive Special';
                tagsDiv.appendChild(tag);
            }
            if (meal.weather && meal.weather.includes(context.weather.type) && context.weather.type !== 'all') {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                tag.style.color = '#93c5fd';
                tag.textContent = `Good for ${context.weather.type} weather`;
                tagsDiv.appendChild(tag);
            }
            if (context.country && meal.countries && meal.countries.includes(context.country)) {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.style.backgroundColor = 'rgba(236, 72, 153, 0.2)';
                tag.style.color = '#f9a8d4';
                tag.textContent = `${context.country} Regional`;
                tagsDiv.appendChild(tag);
            }

            mealPlanContainer.appendChild(node);

            tCals += meal.scaledCals;
            tProt += meal.scaledProtein;
            tCarb += meal.scaledCarbs;
            tFat += meal.scaledFat;
        });

        // Update Totals
        totalCalsEl.textContent = tCals;
        totalProteinEl.textContent = `${tProt}g`;
        totalCarbsEl.textContent = `${tCarb}g`;
        totalFatEl.textContent = `${tFat}g`;
    }

    // Simple WMO weather code mapping to description and Remix Icons
    function getWeatherDescription(code) {
        if (code === 0) return 'Clear sky';
        if (code >= 1 && code <= 3) return 'Partly cloudy';
        if (code >= 45 && code <= 48) return 'Fog';
        if (code >= 51 && code <= 55) return 'Drizzle';
        if (code >= 61 && code <= 65) return 'Rain';
        if (code >= 71 && code <= 77) return 'Snow';
        if (code >= 80 && code <= 82) return 'Rain showers';
        if (code >= 95 && code <= 99) return 'Thunderstorm';
        return 'Unknown';
    }

    function getWeatherIcon(code) {
        if (code === 0) return 'ri-sun-line';
        if (code >= 1 && code <= 3) return 'ri-sun-cloudy-line';
        if (code >= 45 && code <= 48) return 'ri-mist-line';
        if (code >= 51 && code <= 65) return 'ri-rainy-line';
        if (code >= 71 && code <= 77) return 'ri-snowy-line';
        if (code >= 80 && code <= 82) return 'ri-showers-line';
        if (code >= 95 && code <= 99) return 'ri-thunderstorms-line';
        return 'ri-cloud-line';
    }
});
