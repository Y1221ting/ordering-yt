const DEFAULT_SHOP_SETTINGS = {
  shopName: '杨氏御膳房',
  welcomeText: '想吃啥就点啥，姐给你做',
  tasteOptions: ['不辣', '微辣', '中辣', '爆辣'],
  avoidOptions: ['葱', '姜', '蒜', '香菜', '醋', '辣椒']
}

function normalizeText(value, fallback, maxLength) {
  const text = String(value || '').trim()
  return (text || fallback).slice(0, maxLength)
}

function normalizeOptions(value, fallback) {
  const source = Array.isArray(value) ? value : []
  const list = []
  source.forEach(item => {
    const text = String(item || '').trim()
    if (text && !list.includes(text)) {
      list.push(text)
    }
  })
  return list.length > 0 ? list.slice(0, 12) : fallback.slice(0, 12)
}

function normalizeShopSettings(settings = {}) {
  return {
    shopName: normalizeText(
      settings.shopName,
      DEFAULT_SHOP_SETTINGS.shopName,
      20
    ),
    welcomeText: normalizeText(
      settings.welcomeText,
      DEFAULT_SHOP_SETTINGS.welcomeText,
      48
    ),
    tasteOptions: normalizeOptions(
      settings.tasteOptions,
      DEFAULT_SHOP_SETTINGS.tasteOptions
    ),
    avoidOptions: normalizeOptions(
      settings.avoidOptions,
      DEFAULT_SHOP_SETTINGS.avoidOptions
    )
  }
}

async function loadShopSettings(db) {
  try {
    const res = await db.collection('admin')
      .field({
        shopName: true,
        welcomeText: true,
        tasteOptions: true,
        avoidOptions: true
      })
      .limit(1)
      .get()

    return normalizeShopSettings((res.data || [])[0])
  } catch (err) {
    console.warn('读取店铺设置失败，使用默认配置', err)
    return { ...DEFAULT_SHOP_SETTINGS }
  }
}

async function saveShopSettings(db, settings) {
  const normalized = normalizeShopSettings(settings)
  const res = await db.collection('admin').limit(1).get()
  const admin = (res.data || [])[0]

  if (!admin || !admin._id) {
    throw new Error('管理员配置不存在')
  }

  await db.collection('admin').doc(admin._id).update({
    data: {
      ...normalized,
      updateTime: db.serverDate()
    }
  })

  return normalized
}

module.exports = {
  DEFAULT_SHOP_SETTINGS,
  normalizeShopSettings,
  loadShopSettings,
  saveShopSettings
}
