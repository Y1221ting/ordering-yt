const db = wx.cloud.database()
const {
  DEFAULT_SHOP_SETTINGS,
  loadShopSettings,
  saveShopSettings
} = require('../../../utils/shopSettings')

Page({
  data: {
    shopName: DEFAULT_SHOP_SETTINGS.shopName,
    welcomeText: DEFAULT_SHOP_SETTINGS.welcomeText,
    tasteOptions: DEFAULT_SHOP_SETTINGS.tasteOptions,
    avoidOptions: DEFAULT_SHOP_SETTINGS.avoidOptions,
    newTaste: '',
    newAvoid: '',
    loading: false,
    saving: false
  },

  onLoad() {
    this.loadSettings()
  },

  async loadSettings() {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const settings = await loadShopSettings(db)
      this.setData(settings)
    } finally {
      this.setData({ loading: false })
    }
  },

  onShopNameInput(e) {
    this.setData({
      shopName: e.detail.value
    })
  },

  onWelcomeTextInput(e) {
    this.setData({
      welcomeText: e.detail.value
    })
  },

  // ==================== 口味/忌口选项管理 ====================
  onNewTasteInput(e) {
    this.setData({ newTaste: e.detail.value })
  },

  onNewAvoidInput(e) {
    this.setData({ newAvoid: e.detail.value })
  },

  addTasteOption() {
    const value = String(this.data.newTaste || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入辣度选项', icon: 'none' })
      return
    }
    if (this.data.tasteOptions.includes(value)) {
      wx.showToast({ title: '选项已存在', icon: 'none' })
      return
    }
    if (this.data.tasteOptions.length >= 12) {
      wx.showToast({ title: '最多12个选项', icon: 'none' })
      return
    }
    this.setData({
      tasteOptions: this.data.tasteOptions.concat([value]),
      newTaste: ''
    })
  },

  addAvoidOption() {
    const value = String(this.data.newAvoid || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入忌口选项', icon: 'none' })
      return
    }
    if (this.data.avoidOptions.includes(value)) {
      wx.showToast({ title: '选项已存在', icon: 'none' })
      return
    }
    if (this.data.avoidOptions.length >= 12) {
      wx.showToast({ title: '最多12个选项', icon: 'none' })
      return
    }
    this.setData({
      avoidOptions: this.data.avoidOptions.concat([value]),
      newAvoid: ''
    })
  },

  removeTasteOption(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (this.data.tasteOptions.length <= 1) {
      wx.showToast({ title: '至少保留一个选项', icon: 'none' })
      return
    }
    const tasteOptions = this.data.tasteOptions.slice()
    tasteOptions.splice(index, 1)
    this.setData({ tasteOptions })
  },

  removeAvoidOption(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (this.data.avoidOptions.length <= 1) {
      wx.showToast({ title: '至少保留一个选项', icon: 'none' })
      return
    }
    const avoidOptions = this.data.avoidOptions.slice()
    avoidOptions.splice(index, 1)
    this.setData({ avoidOptions })
  },

  async saveSettings() {
    if (this.data.saving) {
      return
    }

    const shopName = String(this.data.shopName || '').trim()
    const welcomeText = String(this.data.welcomeText || '').trim()

    if (!shopName) {
      wx.showToast({
        title: '请输入店铺名称',
        icon: 'none'
      })
      return
    }

    if (!welcomeText) {
      wx.showToast({
        title: '请输入欢迎词',
        icon: 'none'
      })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    try {
      const settings = await saveShopSettings(db, {
        shopName,
        welcomeText,
        tasteOptions: this.data.tasteOptions,
        avoidOptions: this.data.avoidOptions
      })

      this.setData(settings)
      wx.showToast({
        title: '店铺设置已保存',
        icon: 'success'
      })
    } catch (err) {
      console.error('保存店铺设置失败', err)
      wx.showToast({
        title: err.message || '保存失败，请重试',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  }
})
