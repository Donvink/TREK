import { apiMessage, EMPTY_FORM, formToInput } from './travelPlanModel'

describe('travel plan form', () => {
  it('FE-TRAVEL-MODEL-001: turns form text into the request, one destination per line', () => {
    const input = formToInput({ ...EMPTY_FORM, destinations: 'Milano, Italy\n\n Venezia, Italy ', start_date: '2026-11-01', end_date: '2026-11-03', travellers: '3' })
    expect(input).toMatchObject({ title: 'Milano 行程', origin: 'Bellinzona', destinations: ['Milano, Italy', 'Venezia, Italy'], travellers: 3 })
    expect(formToInput({ ...EMPTY_FORM, title: '  我的行程 ', travellers: 'x' })).toMatchObject({ title: '我的行程', travellers: 1 })
  })

  it('FE-TRAVEL-MODEL-002: adds the server reason to an error message when there is one', () => {
    expect(apiMessage({ response: { data: { error: 'No places included' } } }, '生成失败')).toBe('生成失败（No places included）')
    expect(apiMessage({ response: { data: { message: 'Bad' } } }, '失败')).toBe('失败（Bad）')
    expect(apiMessage(new Error('x'), '失败')).toBe('失败')
  })
})
