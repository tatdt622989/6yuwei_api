const xss = require('xss');
// model
const { User } = require('../models/user');

const getData = async (req, res) => {
  const {
    page, limit, keyword,
  } = req.query;
  const pageSize = parseInt(limit, 10) || 12;
  const pageInt = parseInt(page, 10) || 1;
  const skip = (pageInt - 1) * pageSize; // 跳過幾筆
  const keywordFilter = xss(keyword);
  const query = {};
  if (keywordFilter) {
    query.$or = [
      { username: { $regex: keywordFilter, $options: 'i' } },
      { email: { $regex: keywordFilter, $options: 'i' } },
    ];
  }
  console.log(query);

  try {
    const total = await User.countDocuments(query);
    const Users = await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize);

    return res.json({
      msg: 'Successful query',
      data: Users,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
  return false;
};

const updateData = async (req, res) => {
  const { id } = req.params;
  const {
    username, email, phone, country, birth, balance, permissions,
  } = req.body;
  const data = {
    username, email, phone, country, birth, balance, permissions,
  };
  try {
    await User.findByIdAndUpdate(id, data);
    return res.json({
      msg: 'Successful update',
    });
  } catch (error) {
    console.log(error);
  }
  return false;
};

const deleteData = async (req, res) => {
  const { id } = req.params;
  try {
    await User.findByIdAndDelete(id);
    return res.json({
      msg: 'Successful delete',
    });
  } catch (error) {
    console.log(error);
  }
  return false;
};

module.exports = {
  deleteData,
  getData,
  updateData,
};
