/* js/voice-service.js */

let recognition = null;
let isListening = false;
let currentFieldId = null;
let retryCount = 0; // بۆ هەوڵدانەوە

// ١. لیستی گۆڕینی وشە بۆ ژمارە
const numberMapping = {
    'سفر': '0', 'سیفر': '0', 'هیچ': '0', 'صفر': '0', 'zero': '0',
    'یەک': '1', 'یێک': '1', 'یک': '1', 'واحد': '1', 'one': '1',
    'دوو': '2', 'دو': '2', 'اثنان': '2', 'two': '2',
    'سێ': '3', 'سه': '3', 'ثلاثة': '3', 'three': '3',
    'چوار': '4', 'چهار': '4', 'اربعة': '4', 'four': '4',
    'پێنج': '5', 'پنج': '5', 'خمسة': '5', 'five': '5',
    'بنز': '5', 'بانز': '5', 'بێنج': '5', 'بینج': '5', 'پێج': '5',
    'شەش': '6', 'شش': '6', 'ستة': '6', 'six': '6',
    'حەوت': '7', 'هەفت': '7', 'هفت': '7', 'سبعة': '7', 'seven': '7',
    'هەشت': '8', 'هشت': '8', 'ثمانیة': '8', 'eight': '8',
    'نۆ': '9', 'نو': '9', 'نه': '9', 'تسعة': '9', 'nine': '9',
    'دە': '10', 'ده': '10',
    'سەد': '100', 'صد': '100',
    'هەزار': '1000', 'هزار': '1000'
};

// ٢. فەرهەنگی ڕاستکردنەوەی وشەکان
const corrections = {
    'حوال': 'هەڤاڵ', 'هوال': 'هەڤاڵ', 'هافال': 'هەڤاڵ',
    'هاوار': 'هاوڕێ',
    'کلک': 'کەلەک',
    'گردپان': 'گردەپان', 'گرداپان': 'گردەپان', 'گرد پهن': 'گردەپان',
    'فرمانبران': 'فەرمانبەران',
    'باداوا': 'باداوە', 'بدوا': 'باداوە',
    'بردارش': 'بەردەڕەش', 'برد راش': 'بەردەڕەش', 'برداراش': 'بەردەڕەش',
    'هضم': 'حازم', 'شروان': 'شێروان'
};

const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];

// ئەم فەنکشنە سەرەکییەیە
export function startVoiceInput(elementId, lang = 'fa-IR') {
    // پشکنینی سەرەتایی
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        Swal.fire('کێشە', 'وێبگەڕەکەت پشتگیری دەنگ ناکات.', 'error');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // ئەگەر پێشتر کاری دەکرد، بیوەستێنە
    if (recognition && isListening) {
        recognition.stop();
        return; 
    }

    try {
        recognition = new SpeechRecognition();
        currentFieldId = elementId;

        // دیاریکردنی زمان (بە دیفۆڵت فارسییە)
        recognition.lang = lang; 
        
        // گرنگ: continuous دەبێت false بێت بۆ ئەوەی لە مۆبایل کار بکات
        recognition.continuous = false; 
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        updateIcon(elementId, "loading");

        recognition.onstart = () => { 
            isListening = true; 
            retryCount = 0; // سفرکردنەوەی هەوڵەکان
        };

        recognition.onresult = (event) => {
            let transcript = event.results[0][0].transcript;
            console.log(`Input (${lang}):`, transcript);

            // ١. گۆڕینی ژمارەکان
            for (const [word, digit] of Object.entries(numberMapping)) {
                const regex = new RegExp(`(^|\\s)${word}(\\s|$)`, 'g');
                transcript = transcript.replace(regex, `$1${digit}$2`);
            }

            // ٢. ڕاستکردنەوەی وشەکان
            for (const [wrong, right] of Object.entries(corrections)) {
                const regex = new RegExp(wrong, 'g');
                transcript = transcript.replace(regex, right);
            }

            // ٣. گۆڕینی ژمارە فارسی/عەرەبی بۆ ئینگلیزی
            for (let i = 0; i < 10; i++) {
                transcript = transcript.replace(persianDigits[i], i).replace(arabicDigits[i], i);
            }

            // ٤. لابردنی بۆشایی ناو ژمارە
            transcript = transcript.replace(/(\d)\s+(?=\d)/g, '$1');

            // ٥. بە کوردیکردنی پیتەکان
            transcript = transcript
                .replace(/ك/g, 'ک').replace(/ي/g, 'ی')
                .replace(/ة/g, 'ە').replace(/ه$/g, 'ە')
                .replace(/ى/g, 'ی');

            transcript = transcript.trim();

            const inputField = document.getElementById(elementId);
            if (inputField && transcript.length > 0) {
                const currentVal = inputField.value;
                inputField.value = currentVal ? (currentVal + ' ' + transcript) : transcript;
            }
        };

        recognition.onend = () => {
            isListening = false;
            updateIcon(elementId, "default");
        };

        recognition.onerror = (event) => {
            isListening = false;
            console.error("Speech Error:", event.error);

            if (event.error === 'no-speech' || event.error === 'aborted') {
                updateIcon(elementId, "default");
                return;
            }

            // --- بەشی گرنگ: چارەسەری کێشەی مۆبایل ---
            
            // ئەگەر وتی خزمەتگوزاری نییە و ئێمە بە فارسی بووین
            if ((event.error === 'service-not-allowed' || event.error === 'language-not-supported') && lang === 'fa-IR') {
                updateIcon(elementId, "loading"); // نیشانی بدە هێشتا خەریکین
                
                // هەوڵدانەوە بە عەرەبی (Fallback)
                console.warn("Persian failed, switching to Arabic...");
                
                // دووبارە دەستپێکردنەوە بە عەرەبی
                setTimeout(() => {
                    startVoiceInput(elementId, 'ar-IQ');
                }, 200);
                return;
            }

            updateIcon(elementId, "default");

            // نیشاندانی هەڵە ئەگەر عەرەبیش کارینەکرد
            if (event.error === 'not-allowed') {
                Swal.fire({
                    icon: 'error', title: 'ڕێگەپێدان',
                    text: 'تکایە بچۆ Settingsی مۆبایلەکەت و ڕێگە بە مایکرۆفۆن بدە.'
                });
            } else if (event.error === 'service-not-allowed') {
                // ئەگەر عەرەبیش کاری نەکرد
                 Swal.fire('کێشەی ئەپ', 'تکایە دڵنیابە ئەپی "Google" لەسەر مۆبایلەکەت هەیە و ئەبدەیتە.', 'warning');
            } else if (event.error === 'network') {
                 Swal.fire('', 'ئینتەرنێتەکەت لاوازە.', 'info');
            }
        };

        recognition.start();

    } catch (e) {
        updateIcon(elementId, "error");
    }
}

function updateIcon(elementId, state) {
    const btnIcon = document.getElementById('btn-mic-' + elementId);
    if (!btnIcon) return;
    if (state === "loading") {
        btnIcon.className = "fas fa-spinner fa-spin text-danger";
    } else if (state === "error") {
        btnIcon.className = "fas fa-microphone-slash text-muted";
        setTimeout(() => { btnIcon.className = "fas fa-microphone"; }, 2000);
    } else {
        btnIcon.className = "fas fa-microphone";
    }
}

window.startVoiceInput = startVoiceInput;