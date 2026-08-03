// components/avatarNicknameModal/avatarNicknameModal.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    showAvaModal: {
      type: Boolean,
      value: false,
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    avatarUrl: null,
    nickName: null,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 阻止页面滑动
     */
    catchtouchmove() { },

    /**
     * 选择头像返回信息监听
     */
    chooseavatar(res) {
      const avatarUrl = res.detail.avatarUrl
      this.setData({
        avatarUrl: avatarUrl
      })
    },

    /** 获取昵称信息 */
    bindblur(res) {
      const value = res.detail.value
      this.data.nickName = value
    },

    /**
     * 保存用户信息
     */
    async saveUserInfo() {
      const {
        avatarUrl,
        nickName
      } = this.data

      // 检查必填项
      if (!avatarUrl) {
        wx.showToast({
          title: '请选择头像',
          icon: 'none'
        })
        return
      }

      if (!nickName || !nickName.trim()) {
        wx.showToast({
          title: '请输入昵称',
          icon: 'none'
        })
        return
      }

      try {
        wx.showLoading({ title: '保存中...' })
        
        const app = getApp()
        const openid = typeof app.checkOpenid === 'function' ? await app.checkOpenid() : app.globalData.openid

        if (!openid) {
          throw new Error('获取openid失败')
        }

        // 上传头像到云存储
        const cloudPath = `avatar/${openid}_${Date.now()}.png`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: avatarUrl
        })

        const updateData = {
          avatarUrl: uploadRes.fileID,
          nickName: nickName.trim(),
          updateTime: new Date()
        }
        if (typeof app.saveUserProfile !== 'function') {
          throw new Error('保存用户信息方法不存在')
        }
        const latestUserInfo = await app.saveUserProfile(updateData)

        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })

        // 通知父组件更新
        this.triggerEvent("saved", {
          avatarUrl: uploadRes.fileID,
          nickName: nickName.trim(),
          userInfo: latestUserInfo
        })

        // 关闭弹窗
        this.closeModalTap()
      } catch (err) {
        wx.hideLoading()
        console.error('保存用户信息失败', err)
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        })
      }
    },

    /**
     * 设置信息按钮点击监听（保留用于兼容）
     */
    setBtnTap() {
      this.saveUserInfo()
    },

    /**
     * 关闭弹窗
     */
    closeModalTap() {
      this.setData({
        showAvaModal: false,
        nickName: null,
        avatarUrl: null
      })
    },
  }
})
