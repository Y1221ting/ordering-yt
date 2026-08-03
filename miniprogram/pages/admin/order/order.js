// pages/admin/order/order.js
const db = wx.cloud.database()

Page({
  data: {
    orders: [],
    orderType: 0, // 0: 全部, 1: 点餐订单
    typeOptions: [
      { text: '全部订单', value: 0 },
      { text: '点餐订单', value: 1 }
    ],
    // 时间段筛选：0全部 1今天 2昨天 3本周 4本月 5自定义
    timeRange: 0,
    timeOptions: ['全部', '今天', '昨天', '本周', '本月', '自定义'],
    customStart: '',
    customEnd: '',
    // 视图：list 流水 / summary 分类汇总
    viewMode: 'list',
    summaryList: [],
    summaryStats: {
      orderCount: 0,
      dishCount: 0
    },
    summaryLoading: false,
    // 分页相关
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false
  },

  // ==================== 时间范围计算 ====================
  // 生成某天的起止 Date（day=0 今天，day=-1 昨天）
  dayRange(day) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() + day)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    end.setTime(end.getTime() - 1)
    return { start, end }
  },

  // 当前时间段的范围；全部返回 null
  getTimeRange() {
    const range = this.data.timeRange
    const today = new Date()
    const weekDay = (today.getDay() + 6) % 7 // 周一=0

    if (range === 1) {
      return this.dayRange(0)
    }
    if (range === 2) {
      return this.dayRange(-1)
    }
    if (range === 3) {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - weekDay)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    if (range === 4) {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    if (range === 5) {
      if (!this.data.customStart || !this.data.customEnd) {
        return null
      }
      const start = new Date(this.data.customStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(this.data.customEnd)
      end.setHours(23, 59, 59, 999)
      if (start.getTime() > end.getTime()) {
        wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
        return null
      }
      return { start, end }
    }
    return null
  },

  onLoad() {
    this.reloadByViewMode()
  },

  onShow() {
    this.startAutoRefresh()
  },

  onHide() {
    this.clearAutoRefresh()
  },

  onUnload() {
    this.clearAutoRefresh()
  },

  // 加载订单列表
  async loadOrders(append = false) {
    if (this.data.loadingOrders) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingOrders: true })

    try {
      let where = {
        pay_status: true // 只获取已支付成功的订单
      }

      // 按类型筛选（家庭版只有点餐订单）
      if (this.data.orderType === 1) {
        where.type = 'order'
      }

      // 按时间段筛选
      const range = this.getTimeRange()
      if (range) {
        where.createTime = db.command.gte(range.start).and(db.command.lte(range.end))
      }

      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize
      
      const res = await db.collection('order')
        .where(where)
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

      // 处理订单数据，格式化时间并处理标签显示
      const list = (res.data || []).map(order => {
        // 拼口味文本：中辣 · 不吃葱、蒜
        const tasteParts = []
        if (order.taste) {
          tasteParts.push(order.taste)
        }
        if (Array.isArray(order.avoidFoods) && order.avoidFoods.length > 0) {
          tasteParts.push(`不吃${order.avoidFoods.join('、')}`)
        }

        const orderData = {
          ...order,
          createTimeText: order.createTime ? formatTime(order.createTime) : '',
          tasteText: tasteParts.join(' · ')
        }

        // tags 现在直接是字符串数组，不需要额外处理

        return orderData
      })

      const newOrders = append ? this.data.orders.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        orders: newOrders,
        orderPage: page,
        orderHasMore: hasMore
      })
    } catch (err) {
      console.error('加载订单失败', err)
      if (!append) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingOrders: false })
    }
  },

  // 订单类型切换（tabs）
  onChange(e) {
    const index = e.detail.index
    this.setData({
      orderType: index,
      // 重置分页状态
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.reloadByViewMode()
    })
  },

  // 时间段切换
  onTimeRangeChange(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.timeRange) {
      return
    }
    this.setData({
      timeRange: index,
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.reloadByViewMode()
    })
  },

  // 自定义起止日期
  onCustomStartChange(e) {
    this.setData({
      customStart: e.detail.value,
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.reloadByViewMode()
    })
  },

  onCustomEndChange(e) {
    this.setData({
      customEnd: e.detail.value,
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.reloadByViewMode()
    })
  },

  // 视图切换：list 流水 / summary 分类汇总
  onViewModeChange(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.viewMode) {
      return
    }
    this.setData({
      viewMode: mode
    }, () => {
      this.reloadByViewMode()
    })
  },

  // 按当前视图加载
  reloadByViewMode() {
    if (this.data.viewMode === 'summary') {
      this.loadSummary()
    } else {
      this.loadOrders()
    }
  },

  // 手动刷新
  refreshOrders() {
    this.reloadByViewMode()
    wx.showToast({
      title: '已刷新',
      icon: 'none'
    })
  },

  // ==================== 分类汇总视图 ====================
  // 加载时间段内全部点餐订单（家庭订单量小，本地聚合）
  async loadSummary() {
    if (this.data.summaryLoading) {
      return
    }
    this.setData({ summaryLoading: true })
    wx.showLoading({ title: '汇总中...' })

    try {
      let where = {
        pay_status: true,
        type: 'order'
      }
      const range = this.getTimeRange()
      if (range) {
        where.createTime = db.command.gte(range.start).and(db.command.lte(range.end))
      }

      const pageSize = 100
      let allOrders = []
      let skip = 0
      // 循环取完（上限 500 条，家庭场景足够）
      while (skip < 500) {
        const res = await db.collection('order')
          .where(where)
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get()
        const page = res.data || []
        allOrders = allOrders.concat(page)
        if (page.length < pageSize) {
          break
        }
        skip += pageSize
      }

      const { summaryList, stats } = this.buildSummary(allOrders)
      this.setData({
        summaryList,
        summaryStats: stats
      })
    } catch (err) {
      console.error('加载汇总失败', err)
      wx.showToast({
        title: '汇总失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ summaryLoading: false })
    }
  },

  // 把订单按分类聚合：分类 -> 菜品 -> 份数
  buildSummary(orders) {
    const categoryMap = new Map()
    let dishCount = 0

    orders.forEach(order => {
      ;(order.goods || []).forEach(goods => {
        const catName = goods.categoryName || '未分类'
        if (!categoryMap.has(catName)) {
          categoryMap.set(catName, new Map())
        }
        const dishMap = categoryMap.get(catName)
        const dishName = goods.dishName || '未知菜品'
        dishMap.set(dishName, (dishMap.get(dishName) || 0) + (Number(goods.count) || 1))
        dishCount += Number(goods.count) || 1
      })
    })

    const summaryList = []
    categoryMap.forEach((dishMap, catName) => {
      const dishes = []
      dishMap.forEach((count, name) => {
        dishes.push({ name, count })
      })
      summaryList.push({
        categoryName: catName,
        dishes
      })
    })

    return {
      summaryList,
      stats: {
        orderCount: orders.length,
        dishCount
      }
    }
  },

  // 启动自动刷新
  startAutoRefresh() {
    this.clearAutoRefresh()
    // 立即加载一次
    this.reloadByViewMode()
    // 每 10 秒刷新一次
    this.refreshTimer = setInterval(() => {
      this.reloadByViewMode()
    }, 10000)
  },

  // 清除自动刷新
  clearAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  },

  // 触底加载更多（仅流水视图）
  onReachBottom() {
    if (this.data.viewMode !== 'list') {
      return
    }
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },


  // 阻止冒泡
  stopPropagation() {},
  
  // 删除订单
  deleteOrder(e) {
    const order = e.currentTarget.dataset.order

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('order').doc(order._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadOrders()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

