const fs = require('fs');
let code = fs.readFileSync('js/modals.js', 'utf8');

const target = `<div style="background: rgba(99, 102, 241, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2); margin-bottom: 20px; font-size: 0.85rem;">
        <strong>صيغة JSON المدعومة (مثال):</strong>
        <pre style="direction: ltr; text-align: left; background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 6px; margin-top: 8px; overflow-x: auto;">
[
  {
    "type": "mcq",
    "question_text": "ما هي عاصمة مصر؟",
    "options": ["الإسكندرية", "القاهرة", "الأقصر", "أسوان"],
    "correct_answer": 1, 
    "explanation": "القاهرة هي العاصمة."
  },
  {
    "type": "true_false",
    "question_text": "الشمس تدور حول الأرض",
    "correct_answer": "false"
  }
]
        </pre>
      </div>`;

const replacement = `<div style="background: rgba(99, 102, 241, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2); margin-bottom: 20px; font-size: 0.85rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <strong>دليل صيغة JSON الشامل (اضغط للنسخ):</strong>
          <button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="navigator.clipboard.writeText(this.nextElementSibling.innerText); showToast('تم النسخ');">نسخ الدليل</button>
          <pre id="jsonGuide" style="direction: ltr; text-align: left; background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 6px; margin-top: 8px; overflow-x: auto; max-height: 150px; width: 100%; display:block;">[
  {
    "type": "mcq",
    "question_text": "سؤال اختيارات؟",
    "options": ["أ", "ب", "ج", "د"],
    "correct_answer": 0,
    "explanation": "الخيار أ هو الصحيح لأن..."
  },
  {
    "type": "true_false",
    "question_text": "سؤال صح وخطأ؟",
    "correct_answer": "true",
    "explanation": "التفسير هنا"
  },
  {
    "type": "essay",
    "question_text": "اشرح سؤال مقالي؟",
    "explanation": "الإجابة النموذجية التي يقارن بها الطالب"
  },
  {
    "type": "matching",
    "question_text": "سؤال توصيل",
    "options": ["تفاحة", "موزة"],
    "matches": ["أحمر", "أصفر"],
    "explanation": "تفاحة-أحمر، موزة-أصفر"
  }
]</pre>
        </div>
      </div>`;

code = code.replace(target, replacement);
fs.writeFileSync('js/modals.js', code);
