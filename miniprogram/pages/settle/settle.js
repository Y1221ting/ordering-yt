// pages/settle/settle.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    orderGoods: [],
    totalPrice: 0,
    finalPrice: 0,
    remark: '',
    userInfo: null,
    submitting: false,
    canSubmit: false
  },

  onLoad() {
    this.loadCartData()
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
    this.updateCanSubmit()
  },

  loadCartData() {
    try {
      const cartData = wx.getStorageSync('settleCartData')
      if (!cartData) {
        wx.showToast({
          title: '购物车为空',
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
          name: '默认规格',
          price: item.info.price
        }
        const unitPrice = Number(sku.price || item.info.price || 0)
        const count = Number(item.count || 0)
        const subtotal = (unitPrice * count).toFixed(2)

        goodsList.push({
          cartKey,
          dishId: item.dishId || item.info._id,
          dishName: item.info.name,
          dishImage: item.info.image,
          skuId: sku.id || 'default',
          skuName: sku.name || '默认规格',
          price: unitPrice,
          count,
          tags: tagsArray,
          subtotal
        })
      }

      const totalPrice = Number(cartData.totalPrice) || 0

      this.setData({
        orderGoods: goodsList,
        totalPrice,
        finalPrice: totalPrice
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

    const actualFinalPrice = Number(this.data.finalPrice) || 0

    this.setData({ submitting: true })
    wx.showLoading({ title: '下单中...' })

    try {
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods: this.data.orderGoods,
          totalPrice: this.data.totalPrice,
          finalPrice: actualFinalPrice,
          remark: this.data.remark || ''
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
