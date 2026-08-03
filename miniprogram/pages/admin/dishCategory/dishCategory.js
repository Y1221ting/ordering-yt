// pages/admin/dishCategory/dishCategory.js
const db = wx.cloud.database()

Page({
  data: {
    categories: [],
    showModal: false,
    editMode: false, // false: 添加, true: 编辑
    currentCategory: {
      _id: '',
      name: '',
      sort: 0,
      icon: ''
    }
  },

  onLoad() {
    this.loadCategories()
  },

  onShow() {
    this.loadCategories()
  },

  // 加载分类列表
  async loadCategories() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const res = await db.collection('dishCategory')
        .orderBy('sort', 'asc')
        .get()

      wx.hideLoading()
      
      this.setData({
        categories: res.data
      })
    } catch (err) {
      wx.hideLoading()
      console.error('加载分类失败', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 显示添加弹窗
  showAddModal() {
    this.setData({
      showModal: true,
      editMode: false,
      currentCategory: {
        _id: '',
        name: '',
        sort: this.data.categories.length,
        icon: '🍜'
      }
    })
  },

  // 显示编辑弹窗
  showEditModal(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      showModal: true,
      editMode: true,
      currentCategory: { ...category }
    })
  },

  // 关闭弹窗
  closeModal() {
    this.setData({
      showModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入名称
  onNameInput(e) {
    this.setData({
      'currentCategory.name': e.detail.value
    })
  },

  // 输入排序
  onSortInput(e) {
    this.setData({
      'currentCategory.sort': parseInt(e.detail.value) || 0
    })
  },

  // 输入图标
  onIconInput(e) {
    this.setData({
      'currentCategory.icon': e.detail.value
    })
  },

  // 保存分类
  async saveCategory() {
    const { editMode, currentCategory } = this.data

    if (!currentCategory.name.trim()) {
      wx.showToast({
        title: '请输入分类名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      if (editMode) {
        // 编辑
        const { _id, _openid,...updateData } = currentCategory
        await db.collection('dishCategory').doc(_id).update({
          data: updateData
        })
      } else {
        // 添加
        await db.collection('dishCategory').add({
          data: {
            name: currentCategory.name,
            sort: currentCategory.sort,
            icon: currentCategory.icon || '🍜',
            createTime: new Date()
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeModal()
      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 删除分类
  deleteCategory(e) {
    const category = e.currentTarget.dataset.category

    wx.showModal({
      title: '确认删除',
      content: `确定要删除分类"${category.name}"吗？`,
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        // 删除前检查该分类下的菜品数量，防止菜品变孤儿（任何页面都查不到）
        try {
          const countRes = await db.collection('dish').where({
            categoryId: category._id
          }).count()
          const dishCount = countRes.total || 0

          if (dishCount > 0) {
            wx.showModal({
              title: '该分类下有菜品',
              content: `分类"${category.name}"下还有 ${dishCount} 道菜，删除后这些菜将无法显示。确定仍要删除吗？`,
              confirmText: '仍要删除',
              confirmColor: '#f56c6c',
              cancelText: '取消',
              success: (res2) => {
                if (res2.confirm) {
                  this.performDeleteCategory(category)
                }
              }
            })
            return
          }
        } catch (err) {
          console.error('检查分类菜品失败', err)
        }

        this.performDeleteCategory(category)
      }
    })
  },

  async performDeleteCategory(category) {
    try {
      wx.showLoading({ title: '删除中...' })

      await db.collection('dishCategory').doc(category._id).remove()

      wx.hideLoading()
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      })

      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      console.error('删除失败', err)
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
    }
  }
})

