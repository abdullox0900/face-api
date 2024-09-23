const MODEL_URL = '../models'
let faceMatcher = null
let capturedImage = null
let clientsData = []

async function loadModels() {
    try {
        await faceapi.loadSsdMobilenetv1Model(MODEL_URL)
        await faceapi.loadFaceLandmarkModel(MODEL_URL)
        await faceapi.loadFaceRecognitionModel(MODEL_URL)
        console.log('Modellar yuklandi')
    } catch (error) {
        console.error('Modellarni yuklashda xato:', error)
    }
}

async function fetchClientsData() {
    try {
        const response = await fetch('http://192.168.0.108:8000/api/get-day-clients/')
        clientsData = await response.json()
        console.log('Mijozlar ma\'lumotlari yuklandi:', clientsData)
    } catch (error) {
        console.error('Mijozlar ma\'lumotlarini yuklashda xato:', error)
    }
}

async function loadReferenceImages() {
    try {
        const labeledDescriptors = await Promise.all(clientsData.map(async client => {
            try {
                const imgUrl = `http://192.168.0.108:8000${client.img}`
                const img = await faceapi.fetchImage(imgUrl)
                const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
                if (detection) {
                    return new faceapi.LabeledFaceDescriptors(client.code, [detection.descriptor])
                } else {
                    console.warn(`Yuz aniqlanmadi: ${client.code}`)
                    return null
                }
            } catch (error) {
                console.error(`Rasmni yuklashda xato: ${client.code}`, error)
                return null
            }
        }))

        const validDescriptors = labeledDescriptors.filter(desc => desc !== null)
        if (validDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(validDescriptors)
            console.log('Reference rasmlar yuklandi')
        } else {
            console.warn('Hech qanday yaroqli reference rasm topilmadi')
        }
    } catch (error) {
        console.error('Reference rasmlarni yuklashda xato:', error)
    }
}

async function startVideo() {
    const video = document.getElementById('video')
    try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')

        const selectedCamera = videoDevices.length > 1 ? videoDevices[1].deviceId : undefined

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user',
                deviceId: selectedCamera ? { exact: selectedCamera } : undefined
            }
        })
        video.srcObject = stream
        await video.play()
    } catch (error) {
        console.error('Error', error)
    }
}

function captureImage() {
    const video = document.getElementById('video')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    ctx.scale(-1, 1)
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)

    capturedImage = canvas.toDataURL('image/jpeg')

    document.getElementById('captured-image').src = capturedImage
    document.getElementById('video-container').style.display = 'none'
    document.getElementById('captured-image-container').style.display = 'block'
    document.getElementById('capture-btn').style.display = 'none'
    document.getElementById('send-btn').style.display = 'inline-block'
    document.getElementById('retake-btn').style.display = 'inline-block'

    processImage()
}

function retakeImage() {
    resetCameraView()
}

function resetCameraView() {
    capturedImage = null
    document.getElementById('video-container').style.display = 'block'
    document.getElementById('captured-image-container').style.display = 'none'
    document.getElementById('capture-btn').style.display = 'inline-block'
    document.getElementById('send-btn').style.display = 'none'
    document.getElementById('retake-btn').style.display = 'none'
    document.getElementById('status').textContent = ''
    document.getElementById('status').className = ''
}

async function processImage() {
    if (!capturedImage) {
        updateStatus('Rasm olinmagan', false)
        return
    }

    if (!faceMatcher) {
        updateStatus('Reference ma\'lumotlar yuklanmagan', false)
        return
    }

    const img = await faceapi.fetchImage(capturedImage)
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()

    if (detection) {
        const match = faceMatcher.findBestMatch(detection.descriptor)
        if (match.label !== 'unknown') {
            updateStatus('Rasm bazada topildi', true)
        } else {
            updateStatus('Rasm bazada topilmadi', false)
        }
    } else {
        updateStatus('Yuz aniqlanmadi', false)
    }
}

function updateStatus(message, success) {
    const statusElement = document.getElementById('status')
    statusElement.textContent = message
    statusElement.className = success ? 'success' : 'failure'
}

async function sendToAPI() {
    if (!capturedImage) {
        updateStatus('Rasm olinmagan', false)
        return
    }

    if (!faceMatcher) {
        updateStatus('Reference ma\'lumotlar yuklanmagan', false)
        return
    }

    const img = await faceapi.fetchImage(capturedImage)
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()

    if (detection) {
        const match = faceMatcher.findBestMatch(detection.descriptor)

        try {
            let formData = new FormData()
            if (match.label !== 'unknown') {
                formData.append('code', match.label)
            } else {
                const blob = await fetch(capturedImage).then(r => r.blob())
                formData.append('img', blob, 'captured_image.jpg')
            }

            const response = await fetch('http://192.168.0.108:8000/api/day-client-attendance/', {
                method: 'POST',
                body: formData
            })

            const result = await response.json()
            console.log('API javobi:', result)
            updateStatus('Ma\'lumot muvaffaqiyatli yuborildi', true)

            setTimeout(() => {
                resetCameraView()
            }, 2000)
        } catch (error) {
            console.error('Ma\'lumotni yuborishda xato:', error)
            updateStatus('Xatolik yuz berdi', false)
        }
    } else {
        updateStatus('Yuz aniqlanmadi, yuborib bo\'lmadi', false)
    }
}

async function init() {
    try {
        await loadModels()
        await fetchClientsData()
        await loadReferenceImages()
        await startVideo()

        document.getElementById('capture-btn').addEventListener('click', captureImage)
        document.getElementById('send-btn').addEventListener('click', sendToAPI)
        document.getElementById('retake-btn').addEventListener('click', retakeImage)
    } catch (error) {
        console.error('Dasturni ishga tushirishda xato:', error)
        updateStatus('Dasturni ishga tushirishda xatolik yuz berdi', false)
    }
}

document.addEventListener('DOMContentLoaded', init)

// by a-abdullox.uz 🌍