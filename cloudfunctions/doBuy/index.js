// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: 'cloud1-5gofagc634ff0959'
})


const db = cloud.database()

function normalizeSkus(dish = {}) {
  const source = Array.isArray(dish.skus) && dish.skus.length > 0
    ? dish.skus
    : [{
      id: 'default',
      name: '默认规格',
      status: 1,
      sort: 0
    }]

  return source.map((sku, index) => ({
    id: sku.id || `sku_${index + 1}`,
    name: sku.name || (index === 0 ? '默认规格' : `规格${index + 1}`),
    status: sku.status === 0 ? 0 : 1,
    sort: Number(sku.sort) || index
  })).sort((a, b) => a.sort - b.sort)
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return []
  }
  return tags
    .map(tag => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 20)
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const {
    orderGoods,
    remark,
    taste,
    avoidFoods
  } = event

  try {
    const result = await db.runTransaction(async transaction => {
      // 1. 检查用户是否存在
      const userRes = await transaction.collection('user').where({
        _openid: openid
      }).get()

      if (!userRes.data || userRes.data.length === 0) {
        throw new Error('用户不存在')
      }

      const user = userRes.data[0]
      const finalRemark = String(remark || '').trim().slice(0, 120)
      // 家庭版：整单辣度与忌口（可选字段）
      const finalTaste = String(taste || '').trim().slice(0, 10)
      const finalAvoidFoods = (Array.isArray(avoidFoods) ? avoidFoods : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 12)

      if (!Array.isArray(orderGoods) || orderGoods.length === 0) {
        throw new Error('订单商品不能为空')
      }

      let validatedGoods = []

      for (const item of orderGoods) {
        const dishId = item && item.dishId
        const count = Math.floor(Number(item && item.count) || 0)

        if (!dishId || count <= 0) {
          throw new Error('订单商品信息不完整')
        }

        const dishRes = await transaction.collection('dish').doc(dishId).get()
        const dish = dishRes.data

        if (!dish || dish.status !== 1) {
          throw new Error('部分菜品已下架，请重新选择')
        }

        const enabledSkus = normalizeSkus(dish).filter(sku => sku.status === 1)
        if (enabledSkus.length === 0) {
          throw new Error(`"${dish.name || '菜品'}"暂无可售规格`)
        }

        const skuId = item.skuId || 'default'
        const sku = enabledSkus.find(skuItem => skuItem.id === skuId) || (skuId === 'default' ? enabledSkus[0] : null)
        if (!sku) {
          throw new Error(`"${dish.name || '菜品'}"规格已下架，请重新选择`)
        }

        validatedGoods.push({
          dishId: dish._id,
          dishName: dish.name || item.dishName || '未知菜品',
          dishImage: dish.image || item.dishImage || '',
          categoryId: dish.categoryId || '', // 家庭版：快照分类，供后台按分类汇总
          categoryName: '', // 稍后统一补齐
          skuId: sku.id,
          skuName: sku.name,
          count,
          tags: normalizeTags(item.tags)
        })
      }

      // 2. 补齐每个菜品的分类名称（同一分类只查一次）
      const categoryIds = [...new Set(validatedGoods.map(g => g.categoryId).filter(Boolean))]
      for (const cid of categoryIds) {
        try {
          const catRes = await transaction.collection('dishCategory').doc(cid).get()
          if (catRes.data) {
            const catName = catRes.data.name || ''
            validatedGoods = validatedGoods.map(g => g.categoryId === cid ? { ...g, categoryName: catName } : g)
          }
        } catch (err) {
          console.error('查询分类名称失败', cid, err)
        }
      }
      validatedGoods = validatedGoods.map(g => ({ ...g, categoryName: g.categoryName || '' }))

      // 3. 创建订单（家庭版：下单即生效，无支付环节）
      const date = new Date() // 记录订单创建时间

      const orderData = {
        type: 'order',
        goods: validatedGoods,
        orderType: 'dineIn',
        // 家庭版：下单即生效，一律标记已支付（订单列表只显示已支付订单）
        pay_status: true,
        createTime: db.serverDate(),
        _openid: openid,
        // 用户信息
        userNickName: user.nickName || '',
        userAvatar: user.avatarUrl || '',
        userPhone: user.phoneNumber || '',
        remark: finalRemark,
        taste: finalTaste,
        avoidFoods: finalAvoidFoods
      }

      const orderRes = await transaction.collection('order').add({
        data: orderData
      })

      const orderId = orderRes._id
      // 添加 _id 和实际时间到订单数据中
      const orderWithId = {
        ...orderData,
        _id: orderId,
        createTime: date // 使用实际的 Date 对象替代 db.serverDate()
      }

      return {
        success: true,
        orderId: orderId,
        order: orderWithId
      }
    })

    return result
  } catch (err) {
    console.error('下单失败', err)
    return {
      success: false,
      error: err.message || '下单失败'
    }
  }
}
