// pages/expense/expense.js
// 家庭记账页：本月预算 + 快速记账 + 本月统计 + 本月明细
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

const CATEGORIES = ['菜', '水果', '零食', '娱乐']

// 金额格式化：保留两位小数
function fmtMoney(n) {
  return (Number(n) || 0).toFixed(2)
}

// 金额格式化：整数不带小数点，非整数保留两位
function fmtNum(n) {
  const v = Number(n) || 0
  return v % 1 === 0 ? String(v) : v.toFixed(2)
}

Page({
  data: {
    categories: CATEGORIES,
    month: '', // 当前月份 YYYY-MM
    monthLabel: '', // 如 2026年8月
    today: '', // 今天 YYYY-MM-DD
    // 预算
    budget: null, // 本月预算金额，null 表示未设置
    budgetText: '',
    spentText: '0.00',
    overText: '0.00',
    remainingText: '0.00',
    budgetPercent: 0,
    overspent: false,
    lastMonthBudget: null, // 上月预算（用于「沿用上月」）
    lastMonthBudgetText: '',
    // 表单
    formAmount: '',
    formCategory: '菜',
    formDate: '',
    formNote: '',
    editingId: '', // 正在编辑的记录id，空表示新增
    // 统计
    totalSpentText: '0.00',
    categoryStats: [],
    personStats: [],
    // 明细
    records: [],
    // 弹窗与状态
    showBudgetModal: false,
    budgetInput: '',
    saving: false,
    loading: false
  },

  onLoad() {
    this.openid = app.globalData.openid
    const now = new Date()
    const month = this.fmtMonth(now)
    this.setData({
      month,
      monthLabel: now.getFullYear() + '年' + (now.getMonth() + 1) + '月',
      today: this.fmtDate(now),
      formDate: this.fmtDate(now)
    })
    this.userMap = {} // _openid -> 昵称映射缓存
  },

  onShow() {
    this.loadAll()
  },

  // ===== 工具函数 =====

  // 补零
  pad(n) {
    return n < 10 ? '0' + n : '' + n
  },

  // 格式化为 YYYY-MM
  fmtMonth(d) {
    return d.getFullYear() + '-' + this.pad(d.getMonth() + 1)
  },

  // 格式化为 YYYY-MM-DD
  fmtDate(d) {
    return this.fmtMonth(d) + '-' + this.pad(d.getDate())
  },

  // 上个月份 YYYY-MM
  getLastMonth(month) {
    const parts = month.split('-')
    const y = Number(parts[0])
    const m = Number(parts[1])
    return m === 1 ? y - 1 + '-12' : y + '-' + this.pad(m - 1)
  },

  // 记录人昵称（未授权昵称显示「家人」）
  getUserName(openid) {
    return (this.userMap && this.userMap[openid]) || '家人'
  },

  // ===== 数据加载 =====

  async loadAll() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const month = this.data.month

      // 本月预算 + 上月预算（用于「沿用上月预算」）
      const budgetRes = await db.collection('expense_budget').where({ month }).limit(1).get()
      const budget = budgetRes.data.length > 0 ? Number(budgetRes.data[0].budget) : null
      const lastRes = await db.collection('expense_budget').where({ month: this.getLastMonth(month) }).limit(1).get()
      const lastMonthBudget = lastRes.data.length > 0 ? Number(lastRes.data[0].budget) : null

      // 本月记录（按日期字符串范围过滤，家庭单月最多取 100 条）
      const recordRes = await db.collection('expense')
        .where({ date: _.gte(month + '-01').and(_.lte(month + '-31')) })
        .orderBy('date', 'desc')
        .orderBy('_id', 'desc')
        .limit(100)
        .get()
      const records = recordRes.data || []

      // 记录人昵称映射（user 集合按 _openid 映射）
      try {
        const userRes = await db.collection('user').limit(100).get()
        const userMap = {}
        ;(userRes.data || []).forEach(u => {
          if (u._openid && u.nickName) userMap[u._openid] = u.nickName
        })
        this.userMap = userMap
      } catch (err) {
        console.error('获取用户昵称失败', err)
      }

      // 汇总计算：余额 = 预算 - 已花（实时计算不落库）
      let spent = 0
      records.forEach(r => {
        spent += Number(r.amount) || 0
      })
      const remaining = budget === null ? null : budget - spent
      const overspent = budget !== null && remaining < 0

      // 分类统计（四类固定都显示，未花的显示 0）
      const catMap = {}
      records.forEach(r => {
        catMap[r.category] = (catMap[r.category] || 0) + (Number(r.amount) || 0)
      })
      const categoryStats = CATEGORIES.map(c => ({
        category: c,
        amount: fmtMoney(catMap[c] || 0)
      }))

      // 按人统计（金额从高到低）
      const personMap = {}
      records.forEach(r => {
        personMap[r._openid] = (personMap[r._openid] || 0) + (Number(r.amount) || 0)
      })
      const personStats = Object.keys(personMap).map(openid => ({
        name: this.getUserName(openid),
        amount: fmtMoney(personMap[openid])
      })).sort((a, b) => Number(b.amount) - Number(a.amount))

      // 明细视图（补昵称、日期短格式、本人标记）
      const recordsView = records.map(r => ({
        _id: r._id,
        dateText: (r.date || '').slice(5),
        category: r.category,
        note: r.note || '',
        amountText: fmtMoney(r.amount),
        userName: this.getUserName(r._openid),
        isMine: r._openid === this.openid
      }))

      // 进度条百分比（超出时按 100% 显示，颜色变红）
      const budgetPercent = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0

      this.setData({
        budget,
        budgetText: budget === null ? '' : fmtNum(budget),
        spentText: fmtMoney(spent),
        overText: overspent ? fmtMoney(spent - budget) : '0.00',
        remainingText: remaining === null ? '—' : fmtMoney(Math.abs(remaining)),
        budgetPercent,
        overspent,
        lastMonthBudget,
        lastMonthBudgetText: lastMonthBudget === null ? '' : fmtNum(lastMonthBudget),
        totalSpentText: fmtMoney(spent),
        categoryStats,
        personStats,
        records: recordsView
      })
    } catch (err) {
      console.error('加载记账数据失败', err)
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // ===== 记账表单 =====

  onAmountInput(e) {
    this.setData({ formAmount: e.detail.value })
  },

  onCategoryTap(e) {
    this.setData({ formCategory: e.currentTarget.dataset.category })
  },

  onDateChange(e) {
    this.setData({ formDate: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ formNote: e.detail.value })
  },

  // 保存记录（新增或修改）
  async saveRecord() {
    if (this.data.saving) return
    const amount = Math.round(parseFloat(this.data.formAmount) * 100) / 100
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' })
      return
    }
    const date = this.data.formDate || this.data.today
    const category = this.data.formCategory
    const note = (this.data.formNote || '').trim()
    this.setData({ saving: true })
    try {
      const editingId = this.data.editingId
      if (editingId) {
        await db.collection('expense').doc(editingId).update({
          data: { date, amount, category, note }
        })
      } else {
        await db.collection('expense').add({
          data: { date, amount, category, note }
        })
      }
      wx.showToast({ title: editingId ? '修改成功' : '记账成功', icon: 'success' })
      this.resetForm()
      this.loadAll()
    } catch (err) {
      console.error('保存记账失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  // 点明细条目回填表单（只能修改自己的记录）
  onRecordTap(e) {
    const id = e.currentTarget.dataset.id
    const record = this.data.records.find(r => r._id === id)
    if (!record) return
    if (!record.isMine) {
      wx.showToast({ title: '只能修改自己的记录', icon: 'none' })
      return
    }
    this.setData({
      editingId: id,
      formAmount: String(Number(record.amountText)),
      formCategory: record.category,
      formDate: this.data.month + '-' + record.dateText,
      formNote: record.note
    })
  },

  cancelEdit() {
    this.resetForm()
  },

  resetForm() {
    this.setData({
      formAmount: '',
      formCategory: '菜',
      formDate: this.data.today,
      formNote: '',
      editingId: ''
    })
  },

  // 删除记录（带确认弹窗）
  deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录吗？删除后不可恢复',
      confirmText: '删除',
      confirmColor: '#f56c6c',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await db.collection('expense').doc(id).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadAll()
        } catch (err) {
          console.error('删除记录失败', err)
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // ===== 预算 =====

  openBudgetModal() {
    this.setData({
      showBudgetModal: true,
      budgetInput: this.data.budget === null ? '' : String(this.data.budget)
    })
  },

  onBudgetInput(e) {
    this.setData({ budgetInput: e.detail.value })
  },

  closeBudgetModal() {
    this.setData({ showBudgetModal: false })
  },

  // 弹窗内：沿用上月（填入输入框）
  fillLastMonthBudget() {
    this.setData({ budgetInput: String(this.data.lastMonthBudget) })
  },

  // 卡片上：一键沿用上月预算（未设本月预算时显示）
  useLastMonthBudget() {
    if (this.data.lastMonthBudget === null) return
    this.saveBudgetValue(this.data.lastMonthBudget, '已沿用上月预算')
  },

  // 弹窗保存
  saveBudget() {
    const value = Math.round(parseFloat(this.data.budgetInput) * 100) / 100
    if (isNaN(value) || value <= 0) {
      wx.showToast({ title: '请输入正确的预算金额', icon: 'none' })
      return
    }
    this.saveBudgetValue(value, '预算已保存')
  },

  // 保存预算（已有记录则更新，否则新增）
  async saveBudgetValue(value, toastTitle) {
    try {
      const month = this.data.month
      const res = await db.collection('expense_budget').where({ month }).limit(1).get()
      if (res.data.length > 0) {
        await db.collection('expense_budget').doc(res.data[0]._id).update({
          data: { budget: value }
        })
      } else {
        await db.collection('expense_budget').add({
          data: { month, budget: value }
        })
      }
      this.setData({ showBudgetModal: false })
      wx.showToast({ title: toastTitle, icon: 'success' })
      this.loadAll()
    } catch (err) {
      console.error('保存预算失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  // 阻止冒泡
  stopPropagation() {}
})
