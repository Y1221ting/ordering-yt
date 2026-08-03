// pages/settle/settle.js
const app = getApp()
const db = wx.cloud.database()
const { loadShopSettings } = require('../../utils/shopSettings')

Page({
  data: {
    orderGoods: [],
    remark: '',
    userInfo: null,
    submitting: false,
    canSubmit: false,
    // 口味选择
    tasteOptions: [],
    avoidOptions: [],
    selectedTaste: '',
    selectedAvoids: []
  },

  onLoad() {
    this.loadCartData()
    this.loadUserInfo()
    this.loadSettings()
  },

  onShow() {
    this.loadUserInfo()
    this.updateCanSubmit()
  },

  async loadSettings() {
    try {
      const settings = await loadShopSettings(db)
      const tasteOptions = settings.tasteOptions || []
      const avoidOptions = settings.avoidOptions || []
      // 默认爆辣；配置里没有爆辣时默认第一项
      const defaultTaste = tasteOptions.indexOf('爆辣') > -1
        ? '爆辣'
        : (tasteOptions[0] || '')

      this.setData({
        tasteOptions,
        avoidOptions,
        selectedTaste: defaultTaste
      })
    } catch (err) {
      console.error('加载口味设置失败', err)
    }
  },

  // 选择辣度（单选）
  selectTaste(e) {
    this.setData({
      selectedTaste: e.currentTarget.dataset.taste
    })
  },

  // 勾选忌口（多选）
  toggleAvoid(e) {
    const avoid = e.currentTarget.dataset.avoid
    const selectedAvoids = this.data.selectedAvoids.slice()
    const index = selectedAvoids.indexOf(avoid)
    if (index > -1) {
      selectedAvoids.splice(index, 1)
    } else {
      selectedAvoids.push(avoid)
    }
    this.setData({ selectedAvoids })
  },

  loadCartData() {
    try {
      const cartData = wx.getStorageSync('settleCartData')
      if (!cartData) {
        wx.showToast({
          title: '菜篮还空着',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }

      const goodsList = []
      for (let cartKey in cartData.cart) {
        const item = cartData.cart[cartKey]
        let tagsArray = []

        if (item.tagLabels && Array.isArray(item.tagLabels)) {
          tagsArray = item.tagLabels
        } else if (item.tags && typeof item.tags === 'object') {
          Object.keys(item.tags).forEach(tagId => {
            const value = item.tags[tagId]
            if (Array.isArray(value)) {
              tagsArray.push(...value)
            } else if (value) {
              tagsArray.push(value)
            }
          })
        }

        const sku = item.sku || {
          id: 'default',
          name: '默认规格'
        }
        const count = Number(item.count || 0)

        goodsList.push({
          cartKey,
          dishId: item.dishId || item.info._id,
          dishName: item.info.name,
          dishImage: item.info.image,
          skuId: sku.id || 'default',
          skuName: sku.name || '默认规格',
          count,
          tags: tagsArray
        })
      }

      this.setData({
        orderGoods: goodsList
      })

      wx.removeStorageSync('settleCartData')
      this.updateCanSubmit()
    } catch (err) {
      console.error('加载购物车数据失败', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async loadUserInfo() {
    try {
      const userInfo = app.globalData.userInfo
      if (userInfo) {
        this.setData({ userInfo })
        this.updateCanSubmit()
      } else {
        await this.loadUserInfoFromDB()
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  },

  async loadUserInfoFromDB() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({
        _openid: openid
      }).get()

      if (res.data && res.data.length > 0) {
        const user = res.data[0]

        this.setData({
          userInfo: user
        })

        app.globalData.userInfo = user
        this.updateCanSubmit()
      }
    } catch (err) {
      console.error('从数据库加载用户信息失败', err)
    }
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  updateCanSubmit() {
    const { orderGoods } = this.data
    let canSubmit = true

    if (!orderGoods || orderGoods.length === 0) {
      canSubmit = false
    }

    this.setData({ canSubmit })
  },

  async submitOrder() {
    if (this.data.submitting) {
      return
    }

    if (!this.data.canSubmit) {
      return
    }

    try {
      await this.loadUserInfoFromDB()
    } catch (err) {
      console.error('加载用户信息失败', err)
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '下单中...' })

    try {
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods: this.data.orderGoods,
          remark: this.data.remark || '',
          taste: this.data.selectedTaste || '',
          avoidFoods: this.data.selectedAvoids || []
        }
      })

      if (!doBuyRes.result || !doBuyRes.result.success) {
        const errorMsg = doBuyRes.result?.error || '下单失败'
        throw new Error(errorMsg)
      }

      wx.hideLoading()
      wx.showToast({ title: '下单成功', icon: 'success' })
      this.clearCart()

      setTimeout(() => {
        wx.switchTab({
          url: '/pages/myorder/myorder'
        })
      }, 1500)
    } catch (err) {
      console.error('创建订单失败', err)
      wx.hideLoading()
      wx.showToast({
        title: err.message || '下单失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  editOrder() {
    wx.navigateBack()
  },

  clearCart() {
    const pages = getCurrentPages()
    const indexPage = pages.find(page => page.route === 'pages/index/index')
    if (indexPage) {
      indexPage.updateCart({})
    }
  }
})
