export const STAGES = [
  ['乳児期', 1, ['germ', 'germ', 'germ', 'insult']],
  ['幼児期', 4, ['germ', 'insult', 'bully', 'insult']],
  ['小学生', 8, ['bully', 'bully', 'lesson_pressure', 'abusive_teacher']],
  ['中学生', 13, ['lesson_pressure', 'exam', 'overtraining', 'bully']],
  ['高校生', 16, ['exam', 'overtraining', 'pimple', 'abusive_teacher']],
  ['青年期', 20, ['exam', 'expense', 'forced_drinking', 'gossip']],
  ['社会人', 25, ['overwork', 'expense', 'intimidating_boss', 'cert']],
  ['働き盛り', 40, ['mischief', 'overwork', 'loan', 'intimidating_boss']],
  ['中年', 55, ['illness', 'loan', 'gossip', 'overwork']],
  ['老後', 70, ['illness', 'loan', 'germ', 'gossip']],
  ['寝たきり', 77, ['illness', 'germ', 'expense', 'insult']]
]

export const BOSSES = [
  ['b_hs', 14],
  ['b_univ', 18],
  ['b_shukatsu', 22],
  ['b_wedding', 30],
  ['b_mortgage', 38],
  ['b_rebel', 45],
  ['b_layoff', 52],
  ['b_illness', 60]
]

export const DEATHS = [
  ['hang', 25, 'intimidating_boss'],
  ['starve', 25, 'expense'],
  ...STAGES.map(([name, age]) => [`collapse-${name}`, age, 'germ'])
]

export const TAG_KILLER = {
  people: 'intimidating_boss',
  money: 'expense',
  accident: 'car',
  sickness: 'germ',
  insult: 'insult',
  work: 'overwork',
  love: 'temptation',
  child: 'mischief',
  exam: 'exam',
  sports: 'overtraining',
  class: 'lesson_pressure'
}

export const TAG_DEATHS = [
  ...Object.entries(TAG_KILLER).map(([tag, killer]) => [`社会人-${tag}`, 25, killer]),
  ['小学生-people-alone', 8, 'bully'],
  ['乳児期-sickness', 1, 'germ'],
  ['乳児期-insult', 1, 'insult'],
  ['老後-people-hang', 70, 'intimidating_boss'],
  ['寝たきり-sickness', 77, 'germ'],
  ['寝たきり-money', 77, 'expense'],
  ['寝たきり-insult', 77, 'insult'],
  ['寝たきり-accident', 77, 'car'],
  ['寝たきり-people', 77, 'intimidating_boss'],
  ['寝たきり-other', 77, 'overwork']
]

export const PART1 = [
  ['小学生-スポーツ', 8, 'overtraining'],
  ['小学生-授業', 8, 'lesson_pressure'],
  ['小学生-事故', 8, 'car'],
  ['小学生-悪口', 8, 'insult'],
  ['中学生-試験', 13, 'exam'],
  ['高校生-恋愛', 16, 'temptation'],
  ['青年期-人間関係', 18, 'intimidating_boss'],
  ['働き盛り-仕事', 40, 'overwork'],
  ['中年-子育て', 55, 'mischief'],
  ['老後-人間関係', 70, 'intimidating_boss'],
  ['老後-病気', 70, 'germ'],
  ['老後-お金', 70, 'expense'],
  ['幼児期-事故', 4, 'car'],
  ['幼児期-悪口', 4, 'insult'],
  ['社会人-事故-left', 25, 'car', true],
  ['社会人-仕事-left', 25, 'overwork', true],
  ['社会人-恋愛-left', 25, 'temptation', true],
  ['社会人-人間関係-left', 25, 'intimidating_boss', true]
]

export const BOSS_CROWD = ['germ', 'insult', 'bully', 'overwork', 'expense', 'exam']
export const ARSENAL_ENEMIES = [
  'overwork',
  'overwork',
  'expense',
  'expense',
  'intimidating_boss',
  'mischief',
  'mischief',
  'gossip',
  'loan',
  'overwork',
  'expense',
  'mischief'
]
