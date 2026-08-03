//app.js
App({
  onLaunch: async function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {

      this.globalData = {
        openid: '',
        openidReady: false,
        openidPromise: null, // 用于存储获取openid的Promise对象
        userInfo: null, // 用户信息
        userInfoReady: false,
        userInfoPromise: null // 用于存储获取用户信息的Promise对象
      }
      this.userInfoListeners = []

      wx.cloud.init({
        env: 'cloud1-5gofagc634ff0959',
        traceUser: true,
      })
      
      // 启动时立即获取openid
      this.getOpenidPromise();
      
      // 重写Page方法，实现全局拦截
      this.overridePage();
      
      // 检查小程序更新
      this.checkForUpdate();
    }
  },
  
  // 重写Page方法，拦截所有页面的onLoad
  overridePage: function() {
    const originalPage = Page;
    const that = this;
    
    // 替换全局的Page方法
    Page = function(pageConfig) {
      // 保存原来的onLoad方法
      const originalOnLoad = pageConfig.onLoad;
      
      // 重写onLoad方法
      pageConfig.onLoad = async function(options) {
        wx.showLoading({
          title: '加载中...',
        });
        
        try {
          // 等待openid获取完成
          await that.checkOpenid();
          wx.hideLoading();
          
          // 调用原来的onLoad
          if (originalOnLoad) {
            originalOnLoad.call(this, options);
          }
        } catch (error) {
          console.error('获取用户信息失败', error);
          wx.hideLoading();
          wx.showToast({
            title: '加载失败，请重试',
            icon: 'none'
          });
        }
      }
      
      // 调用原始的Page构造函数
      return originalPage(pageConfig);
    };
  },
  
  // 将获取openid封装为Promise，方便页面等待openid加载完成
  getOpenidPromise: function() {
    // 如果已经获取过openid，直接返回
    if (this.globalData.openidReady && this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    
    // 如果已经有一个正在进行的Promise，直接返回该Promise
    if (this.globalData.openidPromise) {
      return this.globalData.openidPromise;
    }
    
    // 创建新的Promise并保存
    const db = wx.cloud.database();
    let that = this;
    
    this.globalData.openidPromise = new Promise(async (resolve, reject) => {
      try {
        // 获取 openid：失败自动重试最多 3 次，网络抖动也能恢复
        let openid = ''
        for (let i = 0; i < 3; i++) {
          try {
            const res = await wx.cloud.callFunction({
              name: 'login'
            })
            openid = res.result && res.result.openid
            if (openid) {
              break
            }
          } catch (err) {
            console.error(`获取openid第${i + 1}次失败`, err)
          }
          if (i < 2) {
            await new Promise(r => setTimeout(r, 500))
          }
        }
        if (!openid) {
          throw new Error('获取openid失败')
        }
        that.globalData.openid = openid;
        await that.syncUserRecord()

        // 标记openid已准备好
        that.globalData.openidReady = true;
        that.globalData.userInfoReady = true;
        resolve(openid);
      } catch (error) {
        console.error('获取openid失败', error);
        // 重置promise，下次页面加载会重新尝试（否则一次失败整站永久卡死）
        that.globalData.openidPromise = null;
        reject(error);
      }
    });
    
    return this.globalData.openidPromise;
  },
  
  // 检查openid是否已获取，供页面使用
  checkOpenid: function() {
    return this.getOpenidPromise();
  },

  syncUserRecord: function(updateData = {}) {
    const previousTask = this.globalData.userInfoPromise || Promise.resolve()
    const task = previousTask.catch(() => {}).then(async () => {
      const openid = this.globalData.openid
      if (!openid) {
        throw new Error('获取openid失败')
      }

      const db = wx.cloud.database()
      const userRes = await db.collection('user').where({
        _openid: openid
      }).limit(1).get()

      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        if (Object.keys(updateData).length > 0) {
          await db.collection('user').doc(user._id).update({
            data: updateData
          })
        }
        const latestRes = await db.collection('user').doc(user._id).get()
        this.setUserInfo(latestRes.data || {
          ...user,
          ...updateData
        })
        return this.globalData.userInfo
      }

      const createTime = new Date()
      const addRes = await db.collection('user').add({
        data: {
          ...updateData,
          balance: 0,
          createTime
        }
      })
      const latestRes = await db.collection('user').doc(addRes._id).get()
      this.setUserInfo(latestRes.data || {
        _id: addRes._id,
        _openid: openid,
        ...updateData,
        balance: 0,
        createTime
      })
      return this.globalData.userInfo
    })

    const trackedTask = task.finally(() => {
      if (this.globalData.userInfoPromise === trackedTask) {
        this.globalData.userInfoPromise = null
      }
    })
    this.globalData.userInfoPromise = trackedTask
    return trackedTask
  },

  saveUserProfile: async function(updateData = {}) {
    const openid = await this.checkOpenid()
    if (!openid) {
      throw new Error('获取openid失败')
    }

    return this.syncUserRecord(updateData)
  },

  setUserInfo: function(userInfo) {
    this.globalData.userInfo = {
      ...(this.globalData.userInfo || {}),
      ...(userInfo || {})
    }
    this.globalData.userInfoReady = true

    const listeners = this.userInfoListeners || []
    listeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener(this.globalData.userInfo)
      }
    })
  },

  onUserInfoChange: function(listener) {
    if (!this.userInfoListeners) {
      this.userInfoListeners = []
    }
    if (typeof listener === 'function') {
      this.userInfoListeners.push(listener)
    }
  },

  offUserInfoChange: function(listener) {
    if (!this.userInfoListeners || typeof listener !== 'function') {
      return
    }
    this.userInfoListeners = this.userInfoListeners.filter(item => item !== listener)
  },

  // 检查小程序更新
  checkForUpdate: function() {
    // 判断是否支持更新API
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()

      // 检查更新
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          console.log('发现新版本')
        }
      })

      // 更新下载完成
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          showCancel: true,
          confirmText: '立即更新',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              // 应用新版本
              updateManager.applyUpdate()
            }
          }
        })
      })

      // 更新失败
      updateManager.onUpdateFailed(() => {
        wx.showModal({
          title: '更新失败',
          content: '新版本下载失败，请删除小程序后重新打开',
          showCancel: false
        })
      })
    } else {
      // 不支持更新API，静默处理，不打扰用户
      console.log('当前微信版本不支持更新API')
    }
  }
})
