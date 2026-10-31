"""Generated examples from public schema definitions; never participant rows."""

from training.form_schema import CONTEXT_FIELDS, ESBEU_FIELDS, SpecialValue


def synthetic_context():
    context = {f.identifier: f.choices[0] if f.choices else f.minimum for f in CONTEXT_FIELDS}
    context.update(semester=4, subject_count=5, mandatory_hours_week=20,
                   independent_hours_week=8, sleep_hours=7.5,
                   study_work_difficulty=SpecialValue.NOT_APPLICABLE.value)
    for field in CONTEXT_FIELDS:
        if field.choices == (0, 1, 2, 3, 4) and not field.allows_not_applicable:
            context[field.identifier] = 2
    return context


def synthetic_case():
    return {"context": synthetic_context(), "items": {f.identifier: 2 for f in ESBEU_FIELDS}}
