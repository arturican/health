import { useLiveQuery } from 'dexie-react-hooks'
import type { useDiaryQuery as ApiQuery } from '../client/useDiaryQuery'
import type { useDiaryQueryState as ApiQueryState } from '../client/useDiaryQuery'
import type * as Backup from '../client/backupRepository'
import type { prepareDiaryChange as ApiConfirmation } from '../client/confirmations'
import * as backup from '../data/backupRepository'
import * as fullBackup from '../data/fullBackupRepository'
import * as clear from '../data/clearDiary'
import { db } from '../data/db'
export type { DiaryConfirmation } from '../client/confirmations'
export { listLabHistory } from '../data/labHistoryRepository'
export * from './summaries'
import * as profile from '../data/profileRepository'
import type * as profileApi from '../client/profileRepository'
import * as weight from '../data/weightRepository'
import type * as weightApi from '../client/weightRepository'
import * as product from '../data/productRepository'
import type * as productApi from '../client/productRepository'
import * as food from '../data/foodRepository'
import type * as foodApi from '../client/foodRepository'
import * as nutrition from '../data/nutritionRepository'
import type * as nutritionApi from '../client/nutritionRepository'
import * as steps from '../data/stepsRepository'
import type * as stepsApi from '../client/stepsRepository'
import * as workout from '../data/workoutRepository'
import type * as workoutApi from '../client/workoutRepository'
import * as energyPlan from '../data/energyPlanRepository'
import type * as energyPlanApi from '../client/energyPlanRepository'
import * as photo from '../data/photoRepository'
import type * as photoApi from '../client/photoRepository'
import * as document from '../data/documentRepository'
import type * as documentApi from '../client/documentRepository'
import * as lab from '../data/labRepository'
import type * as labApi from '../client/labRepository'
import * as file from '../data/fileRepository'
import type * as fileApi from '../client/fileRepository'
import * as visibility from '../data/visibilityRepository'
import type * as visibilityApi from '../client/visibilityRepository'

// Временный адаптер для последовательного переноса UI; затем остаётся только в тестах.
export const useDiaryQuery: typeof ApiQuery = (read, dependencies) => useLiveQuery(read, [...(dependencies ?? [])])
export const useDiaryQueryState: typeof ApiQueryState = (read, dependencies) => {
  const data = useDiaryQuery(read, dependencies)
  return { data, current: data !== undefined }
}
export const getProfile: typeof profileApi.getProfile = () => profile.getProfile()
export const createProfile: typeof profileApi.createProfile = (input, weight) => profile.createProfile(input, weight)
export const updateProfile: typeof profileApi.updateProfile = input => profile.updateProfile(input)
export const listWeights: typeof weightApi.listWeights = date => weight.listWeights(date)
export const latestWeight: typeof weightApi.latestWeight = date => weight.latestWeight(date)
export const saveWeight: typeof weightApi.saveWeight = input => weight.saveWeight(input)
export const updateWeight: typeof weightApi.updateWeight = (original, input) => weight.updateWeight(original.id, input)
export const deleteWeight: typeof weightApi.deleteWeight = original => weight.deleteWeight(original.id)
export const listProducts: typeof productApi.listProducts = archived => product.listProducts(archived)
export const getProduct: typeof productApi.getProduct = id => product.getProduct(id)
export const addProduct: typeof productApi.addProduct = input => product.addProduct(input)
export const updateProduct: typeof productApi.updateProduct = (original, input) => product.updateProduct(original.id, input)
export const archiveProduct: typeof productApi.archiveProduct = (original, archived) => product.archiveProduct(original.id, archived)
export const seedProducts: typeof productApi.seedProducts = () => product.seedProducts()
export const listFood: typeof foodApi.listFood = date => food.listFood(date)
export const addFood: typeof foodApi.addFood = input => food.addFood(input)
export const updateFood: typeof foodApi.updateFood = (original, input) => food.updateFood(original.id, input)
export const deleteFood: typeof foodApi.deleteFood = original => food.deleteFood(original.id)
export const copyMeal: typeof foodApi.copyMeal = (source, meal, target) => food.copyMeal(source, meal, target)
export const getNutritionDay: typeof nutritionApi.getNutritionDay = date => nutrition.getNutritionDay(date)
export const setNutritionDay: typeof nutritionApi.setNutritionDay = (date, complete) => nutrition.setNutritionDay(date, complete)
export const getSteps: typeof stepsApi.getSteps = date => steps.getSteps(date)
export const saveSteps: typeof stepsApi.saveSteps = input => steps.saveSteps(input)
export const deleteSteps: typeof stepsApi.deleteSteps = original => steps.deleteSteps(original.date)
export const listWorkouts: typeof workoutApi.listWorkouts = date => workout.listWorkouts(date)
export const addWorkout: typeof workoutApi.addWorkout = input => workout.addWorkout(input)
export const updateWorkout: typeof workoutApi.updateWorkout = (original, input) => workout.updateWorkout(original.id, input)
export const deleteWorkout: typeof workoutApi.deleteWorkout = original => workout.deleteWorkout(original.id)
export const listEnergyPlans: typeof energyPlanApi.listEnergyPlans = () => energyPlan.listEnergyPlans()
export const getEnergyPlan: typeof energyPlanApi.getEnergyPlan = date => energyPlan.getEnergyPlan(date)
export const addEnergyPlan: typeof energyPlanApi.addEnergyPlan = input => energyPlan.addEnergyPlan(input)
export const listPhotos: typeof photoApi.listPhotos = () => photo.listPhotos()
export const addPhoto: typeof photoApi.addPhoto = (input, file) => photo.addPhoto(input, file)
export const updatePhoto: typeof photoApi.updatePhoto = (original, input) => photo.updatePhoto(original.id, input)
export const deletePhoto: typeof photoApi.deletePhoto = original => photo.deletePhoto(original.id)
export const listDocuments: typeof documentApi.listDocuments = () => document.listDocuments()
export const addDocument: typeof documentApi.addDocument = (input, file) => document.addDocument(input, file)
export const updateDocument: typeof documentApi.updateDocument = (original, input) => document.updateDocument(original.id, input)
export const countDocumentResults: typeof documentApi.countDocumentResults = original => document.countDocumentResults(original.id)
export const deleteDocument: typeof documentApi.deleteDocument = original => document.deleteDocument(original.id)
export const deleteDocumentWithResults: typeof documentApi.deleteDocumentWithResults = (original, count) => document.deleteDocumentWithResults(original.id, count)
export const listLabResults: typeof labApi.listLabResults = id => lab.listLabResults(id)
export const addLabResult: typeof labApi.addLabResult = input => lab.addLabResult(input)
export const updateLabResult: typeof labApi.updateLabResult = (original, input) => lab.updateLabResult(original.id, input)
export const deleteLabResult: typeof labApi.deleteLabResult = original => lab.deleteLabResult(original.id)
export const getFile: typeof fileApi.getFile = id => file.getFile(id)
export const getVisibility: typeof visibilityApi.getVisibility = () => visibility.getVisibility()
export const saveVisibility: typeof visibilityApi.saveVisibility = input => visibility.saveVisibility(input)
export const exportTextBackup: typeof Backup.exportTextBackup = () => backup.exportTextBackup()
export const exportFullBackup: typeof Backup.exportFullBackup = () => fullBackup.exportFullBackup()
export const restoreTextBackup: typeof Backup.restoreTextBackup = input => backup.restoreTextBackup(input)
export const restoreFullBackup: typeof Backup.restoreFullBackup = input => fullBackup.restoreFullBackup(input)
export const clearDiary: typeof Backup.clearDiary = () => clear.clearDiary()
export const prepareDiaryChange: typeof ApiConfirmation = async () => ({ context: { epoch: 0, generation: await clear.readDiaryGeneration(db) ?? 'initial' }, changeRevision: 0 })
