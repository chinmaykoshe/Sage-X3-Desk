import KnowledgeBase from '../../db/models/KnowledgeBase.js';
import { getNextSequence } from '../../db/models/Counter.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getArticles = asyncHandler(async (req, res) => {
  const { search, category } = req.query;
  const filter = { isDeleted: false };
  if (category) filter.category = category;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }

  const articles = await KnowledgeBase.find(filter)
    .populate('author', 'fullName designation')
    .sort({ updatedAt: -1 })
    .lean();

  return sendSuccess(res, articles, 'Knowledge base articles retrieved');
});

export const createArticle = asyncHandler(async (req, res) => {
  const articleId = await getNextSequence('kb', 'KB', 101);
  const article = await KnowledgeBase.create({
    ...req.validatedBody,
    articleId,
    author: req.user._id,
  });
  const populated = await KnowledgeBase.findById(article._id).populate('author', 'fullName designation');
  return sendSuccess(res, populated, 'Article created', 201);
});

export const updateArticle = asyncHandler(async (req, res) => {
  const article = await KnowledgeBase.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    req.validatedBody,
    { new: true }
  ).populate('author', 'fullName designation');
  if (!article) throw new AppError('Article not found.', 404);
  return sendSuccess(res, article, 'Article updated');
});

export const deleteArticle = asyncHandler(async (req, res) => {
  const article = await KnowledgeBase.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );
  if (!article) throw new AppError('Article not found.', 404);
  return sendSuccess(res, null, 'Article removed');
});
