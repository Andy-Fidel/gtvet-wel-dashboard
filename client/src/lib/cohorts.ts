export const MISSING_INTAKE = '__missing_intake__'
export const intakeLabel = (value: string) => value === MISSING_INTAKE || !value ? 'Intake year missing' : value
