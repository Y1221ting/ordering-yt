// pages/myorder/myorder.js
const db = wx.cloud.database()
Page({
  data: {
    viewTabs: [
      { name: '今天', mode: 'today' },
      { name: '全部', mode: 'all' }
    ],
    viewMode: 'today', // today=今天全家点的（默认，即共享菜单），all=全部历史
    orderList: [], // 订单列表
    // 分页相关
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadOrders()
  },

  // 切换视图：今天 / 全部
  switchView(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.viewMode) {
      return
    }

    this.setData({
      viewMode: mode,
      orderPage: 0,
      orderHasMore: true,
      orderList: []
    })
    this.loadOrders()
  },

  // 获取今天 0 点的时间
  getTodayStart() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  },

  // 加载订单列表（家庭共享：全家人点的都能看到）
  async loadOrders(append = false) {
    if (this.data.loadingOrders) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    try {
      this.setData({ loadingOrders: true })

      const _ = db.command
      // 不按人过滤，只看点餐订单
      let query = {
        type: 'order',
        pay_status: true
      }

      // 「今天」视图：只看今天 0 点之后的订单
      if (this.data.viewMode === 'today') {
        query.createTime = _.gte(this.getTodayStart())
      }

      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize

      const res = await db.collection('order')
        .where(query)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      // 格式化时间，避免界面显示 [object Object]
      const formatTime = (time) => {
        if (!time) return ''
        const date = time instanceof Date ? time : new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : n)
        const y = date.getFullYear()
        const m = pad(date.getMonth() + 1)
        const d = pad(date.getDate())
        const hh = pad(date.getHours())
        const mm = pad(date.getMinutes())
        return `${y}-${m}-${d} ${hh}:${mm}`
      }

      const list = (res.data || []).map(order => {
        // 拼口味文本：中辣 · 不吃葱、蒜
        const tasteParts = []
        if (order.taste) {
          tasteParts.push(order.taste)
        }
        if (Array.isArray(order.avoidFoods) && order.avoidFoods.length > 0) {
          tasteParts.push(`不吃${order.avoidFoods.join('、')}`)
        }

        return {
          ...order,
          createTimeText: order.createTime ? formatTime(order.createTime) : '',
          tasteText: tasteParts.join(' · '),
          // 点单人信息（共享菜单：区分是谁点的）
          orderUserNickName: order.userNickName || '家人',
          orderUserAvatar: order.userAvatar || ''
        }
      })

      const newList = append ? this.data.orderList.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        orderList: newList,
        orderPage: page,
        orderHasMore: hasMore
      })
    } catch (err) {
      console.error('加载订单失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loadingOrders: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  }
})
