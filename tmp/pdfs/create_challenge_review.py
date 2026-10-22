import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf/leg-pain-on-walking-editorial-review.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
case = json.loads((ROOT / 'assets/clinical-challenges-data.json').read_text(encoding='utf-8-sig'))['cases'][0]
reasoning = case['reasoning']
pdfmetrics.registerFont(TTFont('Review', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Review-Bold', 'C:/Windows/Fonts/arialbd.ttf'))
MAROON = colors.HexColor('#7a2346')
GREY = colors.HexColor('#665e63')
styles = {
    'title': ParagraphStyle('title', fontName='Review-Bold', fontSize=23, leading=28, textColor=MAROON, spaceAfter=10),
    'section': ParagraphStyle('section', fontName='Review-Bold', fontSize=17, leading=22, textColor=MAROON, spaceAfter=10),
    'heading': ParagraphStyle('heading', fontName='Review-Bold', fontSize=10.5, leading=14, textColor=MAROON, spaceBefore=8, spaceAfter=5),
    'body': ParagraphStyle('body', fontName='Review', fontSize=10, leading=13.5, spaceAfter=5),
    'small': ParagraphStyle('small', fontName='Review', fontSize=8.5, leading=11, textColor=GREY, spaceAfter=5),
    'label': ParagraphStyle('label', fontName='Review-Bold', fontSize=9, leading=12, spaceAfter=5, textColor=MAROON, backColor=colors.HexColor('#f5edf1'), borderPadding=5),
}
story = []
verbatim = []
def p(text, style='body', exact=True):
    if exact:
        verbatim.append(text)
    return Paragraph(escape(text), styles[style])
def add(text, style='body', exact=True):
    story.append(p(text, style, exact))
def heading(ref, text):
    add(f'{ref} | {text}', 'heading', False)
def section(num, title, intro=None):
    if story:
        story.append(PageBreak())
    add(f'{num:02d} / {title}', 'section', False)
    if intro:
        add(intro, 'small', False)
def notes():
    story.append(Spacer(1, 7))
    add('EDITORIAL NOTES / REPLACEMENT WORDING', 'small', False)
    for _ in range(2):
        story.append(HRFlowable(width='100%', thickness=0.4, color=colors.HexColor('#ded7db'), spaceBefore=9, spaceAfter=7))
def inquiry(q):
    ident, category, prompt, response = q
    blocks = [p(f'{ident.upper()} | {category}', 'heading', False),
              p(case['display_labels'].get(ident, prompt), 'label')]
    if case['display_labels'].get(ident, prompt) != prompt:
        blocks += [p('Stored full question: ' + prompt, 'small')]
    blocks += [p(response), Spacer(1, 5)]
    story.append(KeepTogether(blocks))

add('Leg Pain on Walking', 'title', False)
add('CLINICAL CHALLENGE 01 | EDITORIAL REVIEW COPY', 'small', False)
add('Current wording, exported 18 October 2026. Reference IDs identify passages for requested edits. Burgundy bands show inquiry buttons; the response appears beneath. Grey notes explain display conditions. Wording is reproduced without editorial changes.', 'small', False)
heading('P01', 'Patient presentation / initial referral')
add(case['initial'])
add('01 / History inquiries - first four', 'heading', False)
for q in case['questions'][:4]:
    inquiry(q)
notes()

section(2, 'History inquiries - remaining four')
for q in case['questions'][4:8]:
    inquiry(q)
notes()

section(3, 'Examination and imaging inquiries')
for q in case['questions'][8:] + case['imaging']:
    inquiry(q)
notes()

section(4, 'Clinical debrief - diagnosis and learning points', 'Shown after a correct diagnosis or two unsuccessful attempts. Learner-entered diagnoses are reproduced from their input rather than authored case text.')
heading('D01', 'Debrief title')
add('Diagnosis & Debrief')
add('Shown after a correct diagnosis.', 'small', False)
add('Clinical Debrief')
add('Shown after two unsuccessful attempts.', 'small', False)
heading('D02', 'Working diagnosis and explanation')
add('Best working diagnosis: ' + case['intended'])
add(case['debrief'])
heading('D03', 'Learner response headings')
add('Your final diagnosis')
add('Followed by the learner\'s final submitted text.', 'small', False)
add('Your ranked differential')
add('Shown only if entries were provided; followed by their ranked list.', 'small', False)
heading('D04', 'Key learning points')
for item in case['key_points']:
    add(item)
heading('D05', 'Clinical caveat')
add(case['caution'])
notes()

section(5, 'Clinical debrief - findings and missed inquiries')
heading('D06', 'Diagnostically useful findings')
for item in reasoning['discriminators']:
    q = next(q for q in case['questions'] if q[0] == item['id'])
    heading('D06-' + item['id'].upper(), item['title'])
    add(f"{item['title']}: {q[3]} {item['why']}")
heading('D07', 'Potentially useful findings not investigated')
add('For each unasked finding from D06, the game displays that finding\'s title and explanation (the "why" sentence), without repeating its clinical response. Only unasked findings are listed.', 'small', False)
add('If all five findings have been investigated, the game displays:', 'small', False)
add('You reviewed the main discriminating findings highlighted in this case. Further inquiry should address a specific unresolved question.')
notes()

section(6, 'Clinical debrief - alternatives and next steps')
heading('D08', 'Important alternatives')
for i, item in enumerate(reasoning['alternatives'], 1):
    heading(f'D08-{i}', item['name'])
    add(f"{item['name']}: {item['distinction']}")
heading('D09', 'Next clinical steps')
for i, item in enumerate(reasoning['next_steps'], 1):
    heading(f'D09-{i}', 'Next step')
    add(item)
notes()

section(7, 'Confidence & Reasoning - diagnosis and confidence', 'Exactly one of the six messages below is shown, using the final submitted answer and its confidence rating. Low = 1-2; Moderate = 3; High = 4-5.')
heading('C00', 'Confidence summary')
add('Your confidence: [Low / Moderate / High] ([rating]/5).', exact=False)
add('Bracketed fields above are filled from the learner\'s final confidence selection.', 'small', False)
for outcome in ['correct', 'incorrect']:
    for category in ['low', 'moderate', 'high']:
        heading(f'C-{outcome.upper()}-{category.upper()}', f'{outcome.capitalize()} final diagnosis / {category} confidence')
        add(reasoning['confidence_feedback'][outcome][category])
notes()

section(8, 'Evidence feedback, submission messages and reading')
add('One evidence message below is appended to the confidence message on page 7. The efficiency paragraph follows in every debrief.', 'small', False)
heading('E01', 'Key discriminating evidence gathered')
add('Condition: H01 plus either H02 or H03 was investigated.', 'small', False)
add(reasoning['supported_feedback'])
heading('E02', 'Key discriminating evidence incomplete')
add('Condition: the combination required for E01 was not investigated.', 'small', False)
add(reasoning['limited_feedback'])
heading('E03', 'Efficient inquiry - always shown')
add(reasoning['efficiency_feedback'])
heading('F01', 'Incorrect first attempt')
add('Not quite. One diagnostic attempt remains. You can investigate further and revise your differential before trying again.')
heading('F02', 'Debrief availability')
add('Your debrief is available below.')
heading('F03', 'Missing diagnosis or confidence')
add('Enter your final diagnosis before submitting.')
add('Select a confidence rating from 1 to 5 before submitting.')
heading('R01', 'Clinical reading links shown in the debrief')
for source in reasoning['sources']:
    add(source['title'] + '\n' + source['url'], 'small')

def page_frame(c, doc):
    c.saveState()
    w, h = doc.pagesize
    c.setStrokeColor(colors.HexColor('#e4d9df'))
    c.line(46, h - 33, w - 46, h - 33)
    c.setFillColor(GREY)
    c.setFont('Review', 8)
    c.drawString(46, h - 25, 'CLINICAL CHALLENGES / WORDING REVIEW')
    c.drawString(46, 25, 'Leg Pain on Walking | Reference IDs support revision instructions')
    c.drawRightString(w - 46, 25, str(doc.page))
    c.restoreState()

doc = SimpleDocTemplate(str(OUT), pagesize=(612, 792), leftMargin=46, rightMargin=46, topMargin=48, bottomMargin=45,
                        title='Leg Pain on Walking - Editorial Review', author='Pain Medicine Learning Modules')
doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
reader = PdfReader(str(OUT))
extracted = '\n'.join(page.extract_text() for page in reader.pages)
normalize = lambda text: ' '.join(text.split())
for text in verbatim:
    assert normalize(text) in normalize(extracted), text
print(f'Created {OUT}; {len(reader.pages)} pages; {len(verbatim)} verbatim passages verified.')
for i, page in enumerate(reader.pages, 1):
    print(f'Page {i}: {len(page.extract_text())} characters')
