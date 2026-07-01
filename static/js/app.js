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
    const dietTypeInputs = document.getElementsByName('dietType');
    const allergyCheckboxes = document.querySelectorAll('.allergy-tag input[type="checkbox"]');
    const mealPlanContainer = document.getElementById('mealPlanContainer');
    
    // Output Elements
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherDesc = document.getElementById('weatherDesc');
    const festivalName = document.getElementById('festivalName');
    const targetCaloriesEl = document.getElementById('targetCalories');
    const targetProteinValEl = document.getElementById('targetProteinVal');
    const bmiValEl = document.getElementById('bmiVal');
    const bmiCategoryEl = document.getElementById('bmiCategory');
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

            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            const dietType = [...dietTypeInputs].find(r => r.checked)?.value || 'vegetarian';
            const allergies = [...allergyCheckboxes].filter(cb => cb.checked).map(cb => cb.value);

            // 1. Fetch from Python Backend
            const pyRes = await fetch('/api/generate_plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    units: currentUnits,
                    age: age,
                    gender: genderInput.value,
                    weight: weightKg,
                    height: heightCm,
                    activity: parseFloat(activityInput.value),
                    disease: diseaseInput.value,
                    country: countryInput.value.trim(),
                    city: cityInput.value.trim(),
                    birthdate: birthdateInput ? birthdateInput.value : '',
                    anniversary: anniversaryInput ? anniversaryInput.value : '',
                    apiKey: apiKey,
                    dietType: dietType,
                    allergies: allergies
                })
            });

            if (!pyRes.ok) {
                throw new Error("Failed to fetch plan from server.");
            }

            const data = await pyRes.json();

            // 2. Update UI with calculated values from Python
            if (bmiValEl) bmiValEl.textContent = data.bmi.toFixed(1);
            
            let goalText = "Maintenance Target";
            if (age < 18) {
                goalText = "Growing Child Maintenance";
            } else if (data.bmi >= 25) {
                goalText = "Weight Loss Target";
            } else if (data.bmi < 18.5) {
                goalText = "Weight Gain Target";
            }
            
            if (bmiCategoryEl) bmiCategoryEl.textContent = "BMI Score";
            
            targetCaloriesEl.textContent = `${data.targetCalories} kcal`;
            targetCaloriesEl.nextElementSibling.textContent = goalText;
            if (targetProteinValEl) targetProteinValEl.textContent = `${data.targetProtein} g`;

            let mealPlan = data.plan;

            // 3. Optional: Live Fetch if apiKey exists
            if (apiKey) {
                btn.innerHTML = '<span>Fetching Live Recipes...</span><i class="ri-loader-4-line spin"></i>';
                try {
                    mealPlan = await generateLiveMealPlan(apiKey, data.targetCalories, data.context);
                } catch(e) {
                    console.error("Live fetch failed, using fallback from backend.", e);
                }
            }

            // 4. Render Results
            renderResults(mealPlan, data.context);
            
            // 5. Render Health Analysis
            renderHealthAnalysis(data.healthAnalysis, data.bmi);

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

    async function fetchSpoonacularMeal(apiKey, type, maxCals, context) {
        let intolerances = '';
        if (context.disease === 'Celiac') intolerances = '&intolerances=gluten';
        
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
            if (!meal) return; // Skip if no meal found

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

    function renderHealthAnalysis(h, bmi) {
        if (!h) return;

        // BMI Alert
        const bmiAlert = document.getElementById('bmiAlert');
        if (h.bmiDanger) {
            bmiAlert.classList.remove('hidden', 'warning');
            if (h.bmiAlertType === 'warning') bmiAlert.classList.add('warning');
            document.getElementById('bmiAlertText').textContent = h.bmiDanger;
        } else {
            bmiAlert.classList.add('hidden');
        }

        // Health Score Circle (conic-gradient animation)
        const score = h.score;
        const deg = Math.round((score / 100) * 360);
        let scoreColor = '#10b981'; // green
        if (score < 60) scoreColor = '#ef4444';
        else if (score < 80) scoreColor = '#f59e0b';
        const circle = document.getElementById('healthScoreCircle');
        circle.style.background = `conic-gradient(${scoreColor} ${deg}deg, rgba(255,255,255,0.05) ${deg}deg)`;
        document.getElementById('healthScoreVal').textContent = score;
        document.getElementById('healthScoreMsg').textContent = h.scoreMsg;

        // Score breakdown pills
        const breakdown = document.getElementById('scoreBreakdown');
        breakdown.innerHTML = h.scoreBreakdown.map(b =>
            `<span class="score-pill ${b.type}">${b.label}</span>`
        ).join('');

        // Macro ratio bars
        const setBar = (barId, pctId, pct) => {
            document.getElementById(barId).style.width = `${Math.min(pct, 100)}%`;
            document.getElementById(pctId).textContent = `${pct}%`;
        };
        setBar('carbRatioBar', 'carbRatioPct', h.carbPct);
        setBar('protRatioBar', 'protRatioPct', h.protPct);
        setBar('fatRatioBar', 'fatRatioPct', h.fatPct);

        // Nutrient cards
        document.getElementById('fiberVal').textContent = `${h.totalFiber} g`;
        document.getElementById('fiberTarget').textContent = `Target: ${h.fiberTarget}g/day`;
        const fiberCard = document.getElementById('fiberCard');
        fiberCard.classList.toggle('over-limit', h.totalFiber < h.fiberTarget * 0.8);

        document.getElementById('sodiumVal').textContent = `${h.totalSodium} mg`;
        document.getElementById('sodiumTarget').textContent = `Limit: <${h.sodiumTarget}mg/day`;
        const sodiumCard = document.getElementById('sodiumCard');
        sodiumCard.classList.toggle('over-limit', h.totalSodium > h.sodiumTarget);

        document.getElementById('hydrationVal').textContent = `${h.hydrationL} L`;
        document.getElementById('timelineVal').textContent = h.timelineVal;
        document.getElementById('timelineMsg').textContent = h.timelineMsg;

        // Health tips
        const tipsEl = document.getElementById('healthTips');
        tipsEl.innerHTML = h.tips.map(tip =>
            `<div class="health-tip tip-${tip.type}">${tip.icon} ${tip.text}</div>`
        ).join('');
    }
});
