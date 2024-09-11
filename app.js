// Global o'zgaruvchilar
const MODEL_URL = '/models'
let faceMatcher = null

// Modellarni yuklash
async function loadModels() {
    console.log('Modellar yuklanmoqda...')
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        console.log('Barcha modellar muvaffaqiyatli yuklandi')
    } catch (err) {
        console.error('Modellarni yuklashda xatolik:', err)
        throw err
    }
}

// Reference rasmlarni yuklash va FaceMatcher yaratish
async function loadReferenceImages() {
    console.log('Reference rasmlar yuklanmoqda...')
    try {
        const labeledDescriptors = await Promise.all([
            loadImageAndGetDescriptor('referenceImage1', 'Abdullox'),
            loadImageAndGetDescriptor('referenceImage2', 'Boburjon'),
            loadImageAndGetDescriptor('referenceImage3', 'Kamron')
        ])

        faceMatcher = new faceapi.FaceMatcher(labeledDescriptors)
        console.log('Reference rasmlar muvaffaqiyatli yuklandi va FaceMatcher yaratildi')
    } catch (err) {
        console.error('Reference rasmlarni yuklashda xatolik:', err)
        throw err
    }
}

// Rasm yuklash va deskriptor olish
async function loadImageAndGetDescriptor(imageId, label) {
    return new Promise(async (resolve, reject) => {
        const img = document.getElementById(imageId)
        if (!img) {
            reject(new Error(`${imageId} elementini topib bo'lmadi`))
            return
        }

        if (!img.complete) {
            img.onload = async () => {
                try {
                    const descriptor = await getDescriptor(img, label)
                    resolve(descriptor)
                } catch (err) {
                    reject(err)
                }
            }
            img.onerror = () => reject(new Error(`${label} rasmini yuklashda xatolik`))
        } else {
            try {
                const descriptor = await getDescriptor(img, label)
                resolve(descriptor)
            } catch (err) {
                reject(err)
            }
        }
    })
}

async function getDescriptor(img, label) {
    const detections = await faceapi.detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor()
    if (!detections) {
        throw new Error(`${label} uchun yuzni aniqlab bo'lmadi`)
    }
    return new faceapi.LabeledFaceDescriptors(label, [detections.descriptor])
}

// Kamerani ishga tushirish
async function startVideo() {
    const video = document.getElementById('video')
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        })
        video.srcObject = stream
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video)
            }
        })
    } catch (err) {
        console.error('Kamera xatosi:', err)
        alert('Kamerani ulashda xatolik yuz berdi. Iltimos, kamera ruxsatlarini tekshiring va qayta urining.')
        throw err
    }
}

// Asosiy funksiya
async function startFaceRecognition() {
    console.log('Face recognition boshlanmoqda...')
    try {
        await loadModels()
        await loadReferenceImages()
        const video = await startVideo()

        const canvas = faceapi.createCanvasFromMedia(video)
        document.body.append(canvas)
        const displaySize = { width: video.width, height: video.height }
        faceapi.matchDimensions(canvas, displaySize)

        let lastProcessedTime = Date.now()
        const processInterval = 500 // Har 500 ms da bir marta qayta ishlash

        video.addEventListener('play', () => {
            const loop = async () => {
                const now = Date.now()
                if (now - lastProcessedTime >= processInterval) {
                    const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
                        .withFaceLandmarks()
                        .withFaceDescriptors()

                    const resizedDetections = faceapi.resizeResults(detections, displaySize)

                    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
                    faceapi.draw.drawDetections(canvas, resizedDetections)

                    if (detections.length > 0) {
                        const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor)
                        console.log('Yuz aniqlandi:', bestMatch.toString())
                    }

                    lastProcessedTime = now
                }
                requestAnimationFrame(loop)
            }
            loop()
        })

        console.log('Face recognition muvaffaqiyatli boshlandi')
    } catch (err) {
        console.error('Face recognition boshlashda xatolik:', err)
    }
}

// Dasturni ishga tushirish
document.addEventListener('DOMContentLoaded', startFaceRecognition)

console.log('Script yuklandi')