import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, AlertCircle, User, FileText, Shield, Home, Gavel } from 'lucide-react';

const DSMAdmissionForm = () => {
  console.log("hello world");
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    // Personal Information
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    age: '',
    ssn: '',
    dlNumber: '',
    dlState: '',
    dlRevoked: false,
    dlRevokedDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    homePhone: '',
    workPhone: '',
    gender: '',
    race: '',
    nationality: '',
    maritalStatus: '',
    usCitizen: true,
    residencyNumber: '',
    primaryLanguage: '',
    referredBy: '',
    highestGrade: '',
    yearGraduated: '',
    collegeHours: '',
    degree: '',
    
    // Employment
    currentlyEmployed: false,
    employmentType: '',
    employer: '',
    occupation: '',
    hourlyIncome: '',
    payFrequency: '',
    specialSkills: '',
    
    // History
    substanceAbuseTreatment: false,
    substanceAbuseTreatmentWhere: '',
    substanceAbuseTreatmentWhen: '',
    mentalHealthTreatment: false,
    mentalHealthTreatmentWhere: '',
    mentalHealthTreatmentWhen: '',
    previousDSMHelp: false,
    previousDSMWhen: '',
    suicidalThoughts: false,
    arrested: false,
    currentlyInCriminalJustice: false,
    incarcerationDetails: '',
    courtDates: '',
    probationOfficer: '',
    alcoholUse: false,
    drugUse: false,
    drugPreference: '',
    lastUseDate: '',
    
    // Healthcare
    healthcareType: '',
    terminalIllnesses: '',
    currentMedications: '',
    
    // Admission Reasons
    reasonShelter: false,
    reasonSpiritualGrowth: false,
    reasonRestoration: false,
    reasonOvercomeAddiction: false,
    accomplishmentGoals: '',
    talentsGifts: '',
    
    // Emergency Contacts
    emergencyContact1Name: '',
    emergencyContact1Address: '',
    emergencyContact1Phone: '',
    emergencyContact1AltPhone: '',
    emergencyContact1Relationship: '',
    emergencyContact2Name: '',
    emergencyContact2Address: '',
    emergencyContact2Phone: '',
    emergencyContact2AltPhone: '',
    emergencyContact2Relationship: '',
    
    // Agreements
    admissionAgreementAccepted: false,
    liabilityWaiverAccepted: false,
    codeOfConductAccepted: false,
    homeRulesAccepted: false,
    legalStatusAccepted: false,
    
    // Signatures
    signatureDate: new Date().toISOString().split('T')[0],
    witnessName: '',
  witnessSignatureDate: new Date().toISOString().split('T')[0],
  // Electronic signature (adoption)
  applicantFullName: '',
  signatureFont: 'Dancing Script',
  applicantSignatureDataUrl: '',
  applicantInitialsDataUrl: ''
  });

  const [errors, setErrors] = useState({});

  // Signature adoption state
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [sigTab, setSigTab] = useState('type'); // 'type' | 'draw'
  const [sigPreviewName, setSigPreviewName] = useState('');
  const [sigFont, setSigFont] = useState('Dancing Script');
  // Fixed black color for signature
  const signatureColor = '#000000';
  const [penSize, setPenSize] = useState(2);
  const drawCanvasRef = React.useRef(null);
  const drawCtxRef = React.useRef(null);
  const isDrawingRef = React.useRef(false);
  const lastPointRef = React.useRef(null);

  const steps = [
    { title: 'Personal Information', icon: User },
    { title: 'Employment & Education', icon: FileText },
    { title: 'History & Health', icon: Shield },
    { title: 'Emergency Contacts', icon: Home },
    { title: 'Agreements & Consent', icon: Gavel }
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // --- Signature helpers (subset of UserPdfTool) ---
  const ensureHeadLink = (href, attrs = {}) => {
    if (typeof document === 'undefined') return;
    if ([...document.styleSheets].some(s => (s?.href || '').includes(href))) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
    document.head.appendChild(link);
  };

  const ensureSignatureFonts = () => {
    ensureHeadLink(
      'https://fonts.googleapis.com/css2' +
      '?family=Inter:wght@400;500;600;700' +
      '&family=Dancing+Script:wght@400;600;700' +
      '&family=Great+Vibes' +
      '&family=Pacifico' +
      '&family=Satisfy' +
      '&display=swap',
      { 'data-google-fonts': 'true' }
    );
  };

  const FONT_CHOICES = ['Dancing Script', 'Great Vibes', 'Pacifico', 'Satisfy'];

  const generateInitials = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const particles = ['de','la','del','van','von','der','den','ter','da'];
    const sig = parts.filter(p => !particles.includes(p.toLowerCase()));
    if (sig.length >= 2) return (sig[0][0] + sig[sig.length - 1][0]).toUpperCase();
    if (sig.length === 1) return (sig[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
    return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
  };

  const renderTextToDataUrl = async ({ text, fontFamily, color = '#000', width = 600, height = 160 }) => {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, width, height);
    // Fit font size
    let size = 64;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    do {
      ctx.font = `${size}px '${fontFamily}', cursive`;
      const w = ctx.measureText(text).width;
      if (w <= width - 20 || size <= 12) break;
      size -= 2;
    } while (size > 12);
    ctx.font = `${size}px '${fontFamily}', cursive`;
    ctx.fillText(text, width / 2, height / 2 + 2);
    return canvas.toDataURL('image/png');
  };

  const openSignatureModal = () => {
    ensureSignatureFonts();
    const name = (formData.firstName + ' ' + formData.lastName).trim();
    setSigPreviewName(formData.applicantFullName || name);
    setSigFont(formData.signatureFont || 'Dancing Script');
    setSigTab('type');
    setShowSignatureModal(true);
  };

  const closeSignatureModal = () => setShowSignatureModal(false);

  const adoptTypedSignature = async () => {
    const fullName = (sigPreviewName || '').trim();
    if (!fullName) return;
    const initials = generateInitials(fullName);
    const [sigUrl, iniUrl] = await Promise.all([
      renderTextToDataUrl({ text: fullName, fontFamily: sigFont, color: signatureColor, width: 700, height: 180 }),
      renderTextToDataUrl({ text: initials, fontFamily: sigFont, color: signatureColor, width: 260, height: 160 })
    ]);
    setFormData(prev => ({
      ...prev,
      applicantFullName: fullName,
      signatureFont: sigFont,
      applicantSignatureDataUrl: sigUrl,
      applicantInitialsDataUrl: iniUrl
    }));
    setErrors(prev => ({ ...prev, applicantSignatureDataUrl: '' }));
    setShowSignatureModal(false);
  };

  // Drawing canvas simple implementation
  React.useEffect(() => {
    if (!showSignatureModal || sigTab !== 'draw') return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawCtxRef.current = ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = 700, h = 200;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = signatureColor;
    ctx.lineWidth = penSize;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const down = (e) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const { x, y } = getPos(e);
      lastPointRef.current = { x, y };
    };
    const move = (e) => {
      if (!isDrawingRef.current) return;
      const { x, y } = getPos(e);
      const last = lastPointRef.current;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPointRef.current = { x, y };
    };
    const up = () => { isDrawingRef.current = false; };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('touchstart', down);
      canvas.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [showSignatureModal, sigTab, signatureColor, penSize]);

  const clearDrawing = () => {
    const canvas = drawCanvasRef.current;
    const ctx = drawCtxRef.current;
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.restore();
    // Repaint white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  };

  const adoptDrawnSignature = async () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    // Create transparent-trimmed image
    const tmp = document.createElement('canvas');
    const ctx = tmp.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const viewW = 700, viewH = 200;
    tmp.width = Math.floor(viewW * dpr);
    tmp.height = Math.floor(viewH * dpr);
    ctx.scale(dpr, dpr);
    // Draw white background -> then we will convert white to transparent-ish by threshold (simplify: keep white background)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,viewW,viewH);
    ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height, 0, 0, viewW, viewH);
    const sigUrl = tmp.toDataURL('image/png');
    const fullName = (sigPreviewName || (formData.firstName + ' ' + formData.lastName)).trim();
    const initials = generateInitials(fullName);
    const iniUrl = await renderTextToDataUrl({ text: initials, fontFamily: sigFont, color: signatureColor, width: 260, height: 160 });
    setFormData(prev => ({
      ...prev,
      applicantFullName: fullName,
      signatureFont: sigFont,
      applicantSignatureDataUrl: sigUrl,
      applicantInitialsDataUrl: iniUrl
    }));
    setErrors(prev => ({ ...prev, applicantSignatureDataUrl: '' }));
    setShowSignatureModal(false);
  };

  const validateStep = (step) => {
    const newErrors = {};
    
    switch(step) {
      case 0: // Personal Information
        if (!formData.firstName) newErrors.firstName = 'First name is required';
        if (!formData.lastName) newErrors.lastName = 'Last name is required';
        if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
        if (!formData.address) newErrors.address = 'Address is required';
        if (!formData.city) newErrors.city = 'City is required';
        if (!formData.state) newErrors.state = 'State is required';
        if (!formData.zip) newErrors.zip = 'ZIP code is required';
        if (!formData.gender) newErrors.gender = 'Gender is required';
        if (!formData.race) newErrors.race = 'Race is required';
        if (!formData.maritalStatus) newErrors.maritalStatus = 'Marital status is required';
        break;
      
      case 1: // Employment & Education
        if (!formData.highestGrade) newErrors.highestGrade = 'Education level is required';
        break;
      
      case 2: // History & Health
        if (!formData.healthcareType) newErrors.healthcareType = 'Healthcare information is required';
        break;
      
      case 3: // Emergency Contacts
        if (!formData.emergencyContact1Name) newErrors.emergencyContact1Name = 'At least one emergency contact is required';
        if (!formData.emergencyContact1Phone) newErrors.emergencyContact1Phone = 'Emergency contact phone is required';
        if (!formData.emergencyContact1Relationship) newErrors.emergencyContact1Relationship = 'Relationship is required';
        break;
      
      case 4: // Agreements
  if (!formData.admissionAgreementAccepted) newErrors.admissionAgreementAccepted = 'You must accept the admission agreement';
        if (!formData.liabilityWaiverAccepted) newErrors.liabilityWaiverAccepted = 'You must accept the liability waiver';
        if (!formData.codeOfConductAccepted) newErrors.codeOfConductAccepted = 'You must accept the code of conduct';
        if (!formData.homeRulesAccepted) newErrors.homeRulesAccepted = 'You must accept the home rules';
        if (!formData.legalStatusAccepted) newErrors.legalStatusAccepted = 'You must accept the legal status statement';
  if (!formData.applicantSignatureDataUrl) newErrors.applicantSignatureDataUrl = 'Please adopt your electronic signature';
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    
    // Here you would submit the form data to your API
    console.log('Submitting form data:', formData);
    alert('Application submitted successfully!');
  };

  const renderStepContent = () => {
    switch(currentStep) {
      case 0: // Personal Information
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name *</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.firstName ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Middle Name</label>
                <input
                  type="text"
                  name="middleName"
                  value={formData.middleName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name *</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.lastName ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth *</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.dateOfBirth ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Age</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SSN</label>
                <input
                  type="text"
                  name="ssn"
                  value={formData.ssn}
                  onChange={handleInputChange}
                  placeholder="XXX-XX-XXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Driver's License #</label>
                <input
                  type="text"
                  name="dlNumber"
                  value={formData.dlNumber}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State Issued</label>
                <input
                  type="text"
                  name="dlState"
                  value={formData.dlState}
                  onChange={handleInputChange}
                  maxLength="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Address *</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City *</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.city ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State *</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  maxLength="2"
                  className={`w-full px-3 py-2 border rounded-md ${errors.state ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ZIP Code *</label>
                <input
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.zip ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.zip && <p className="text-red-500 text-xs mt-1">{errors.zip}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Home Phone</label>
                <input
                  type="tel"
                  name="homePhone"
                  value={formData.homePhone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Work Phone</label>
                <input
                  type="tel"
                  name="workPhone"
                  value={formData.workPhone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Gender *</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.gender ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Race *</label>
                <select
                  name="race"
                  value={formData.race}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.race ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="">Select...</option>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                  <option value="asian">Asian</option>
                  <option value="native">Native American</option>
                  <option value="other">Other</option>
                </select>
                {errors.race && <p className="text-red-500 text-xs mt-1">{errors.race}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Marital Status *</label>
                <select
                  name="maritalStatus"
                  value={formData.maritalStatus}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${errors.maritalStatus ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="">Select...</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="separated">Separated</option>
                  <option value="widowed">Widowed</option>
                </select>
                {errors.maritalStatus && <p className="text-red-500 text-xs mt-1">{errors.maritalStatus}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Primary Language</label>
                <input
                  type="text"
                  name="primaryLanguage"
                  value={formData.primaryLanguage}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Referred By</label>
                <input
                  type="text"
                  name="referredBy"
                  value={formData.referredBy}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>
        );

      case 1: // Employment & Education
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Education</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Highest Grade Completed *</label>
                  <select
                    name="highestGrade"
                    value={formData.highestGrade}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-md ${errors.highestGrade ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Select...</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                  {errors.highestGrade && <p className="text-red-500 text-xs mt-1">{errors.highestGrade}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Year Graduated/GED</label>
                  <input
                    type="text"
                    name="yearGraduated"
                    value={formData.yearGraduated}
                    onChange={handleInputChange}
                    placeholder="YYYY"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-1">College Hours Completed</label>
                  <input
                    type="text"
                    name="collegeHours"
                    value={formData.collegeHours}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Degree</label>
                  <input
                    type="text"
                    name="degree"
                    value={formData.degree}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Employment</h3>
              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="currentlyEmployed"
                    checked={formData.currentlyEmployed}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Currently Employed</span>
                </label>
              </div>
              
              {formData.currentlyEmployed && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Employment Type</label>
                      <select
                        name="employmentType"
                        value={formData.employmentType}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select...</option>
                        <option value="fullTime">Full Time</option>
                        <option value="partTime">Part Time</option>
                        <option value="temporary">Temporary</option>
                        <option value="seasonal">Seasonal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Employer</label>
                      <input
                        type="text"
                        name="employer"
                        value={formData.employer}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Occupation</label>
                      <input
                        type="text"
                        name="occupation"
                        value={formData.occupation}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Hourly Income</label>
                      <input
                        type="text"
                        name="hourlyIncome"
                        value={formData.hourlyIncome}
                        onChange={handleInputChange}
                        placeholder="$"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Pay Frequency</label>
                      <select
                        name="payFrequency"
                        value={formData.payFrequency}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select...</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Special Skills, Trades, or Vocations</label>
                <textarea
                  name="specialSkills"
                  value={formData.specialSkills}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>
        );

      case 2: // History & Health
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Treatment History</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="substanceAbuseTreatment"
                      checked={formData.substanceAbuseTreatment}
                      onChange={handleInputChange}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">Have you ever been in treatment for substance abuse?</span>
                  </label>
                  {formData.substanceAbuseTreatment && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <input
                        type="text"
                        name="substanceAbuseTreatmentWhere"
                        value={formData.substanceAbuseTreatmentWhere}
                        onChange={handleInputChange}
                        placeholder="Where?"
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <input
                        type="text"
                        name="substanceAbuseTreatmentWhen"
                        value={formData.substanceAbuseTreatmentWhen}
                        onChange={handleInputChange}
                        placeholder="When?"
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="mentalHealthTreatment"
                      checked={formData.mentalHealthTreatment}
                      onChange={handleInputChange}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">Have you ever been in treatment for mental health?</span>
                  </label>
                  {formData.mentalHealthTreatment && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <input
                        type="text"
                        name="mentalHealthTreatmentWhere"
                        value={formData.mentalHealthTreatmentWhere}
                        onChange={handleInputChange}
                        placeholder="Where?"
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <input
                        type="text"
                        name="mentalHealthTreatmentWhen"
                        value={formData.mentalHealthTreatmentWhen}
                        onChange={handleInputChange}
                        placeholder="When?"
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="previousDSMHelp"
                      checked={formData.previousDSMHelp}
                      onChange={handleInputChange}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">Have you ever received help from the DSM previously?</span>
                  </label>
                  {formData.previousDSMHelp && (
                    <input
                      type="text"
                      name="previousDSMWhen"
                      value={formData.previousDSMWhen}
                      onChange={handleInputChange}
                      placeholder="When?"
                      className="px-3 py-2 border border-gray-300 rounded-md mt-2"
                    />
                  )}
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="suicidalThoughts"
                      checked={formData.suicidalThoughts}
                      onChange={handleInputChange}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">Have you ever thought about committing suicide?</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Criminal Justice</h3>
              
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="arrested"
                    checked={formData.arrested}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Have you ever been arrested?</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="currentlyInCriminalJustice"
                    checked={formData.currentlyInCriminalJustice}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Are you currently involved in the criminal justice system?</span>
                </label>

                {(formData.arrested || formData.currentlyInCriminalJustice) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Incarceration Details (Date, Charge, Location)</label>
                      <textarea
                        name="incarcerationDetails"
                        value={formData.incarcerationDetails}
                        onChange={handleInputChange}
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Upcoming Court Dates</label>
                      <input
                        type="text"
                        name="courtDates"
                        value={formData.courtDates}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Probation Officer Name and Number</label>
                      <input
                        type="text"
                        name="probationOfficer"
                        value={formData.probationOfficer}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Substance Use</h3>
              
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="alcoholUse"
                    checked={formData.alcoholUse}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Have you consumed alcohol or beer, past or present?</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="drugUse"
                    checked={formData.drugUse}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Have you used drugs, past or present?</span>
                </label>

                {(formData.alcoholUse || formData.drugUse) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Drug of Preference</label>
                      <input
                        type="text"
                        name="drugPreference"
                        value={formData.drugPreference}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Last Use Date</label>
                      <input
                        type="text"
                        name="lastUseDate"
                        value={formData.lastUseDate}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Healthcare</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Healthcare Coverage *</label>
                  <select
                    name="healthcareType"
                    value={formData.healthcareType}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-md ${errors.healthcareType ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Select...</option>
                    <option value="medicaid">Medicaid</option>
                    <option value="medicare">Medicare</option>
                    <option value="private">Private Insurance</option>
                    <option value="veterans">Veterans Benefits</option>
                    <option value="none">None</option>
                  </select>
                  {errors.healthcareType && <p className="text-red-500 text-xs mt-1">{errors.healthcareType}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Terminal Illnesses, Viruses, or Medical Conditions</label>
                  <textarea
                    name="terminalIllnesses"
                    value={formData.terminalIllnesses}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Please list any medical conditions"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Current Medications</label>
                  <textarea
                    name="currentMedications"
                    value={formData.currentMedications}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Please list all current medications"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Reason for Seeking Admission</h3>
              
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="reasonShelter"
                    checked={formData.reasonShelter}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm">Shelter</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="reasonSpiritualGrowth"
                    checked={formData.reasonSpiritualGrowth}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm">Spiritual Growth</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="reasonRestoration"
                    checked={formData.reasonRestoration}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm">Restoration</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="reasonOvercomeAddiction"
                    checked={formData.reasonOvercomeAddiction}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm">To Overcome Drug/Alcohol Abuse</span>
                </label>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">What do you hope to accomplish while attending DSM?</label>
                <textarea
                  name="accomplishmentGoals"
                  value={formData.accomplishmentGoals}
                  onChange={handleInputChange}
                  rows="4"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">List your talents and gifts</label>
                <textarea
                  name="talentsGifts"
                  value={formData.talentsGifts}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>
        );

      case 3: // Emergency Contacts
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Emergency Contact 1 (Required)</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    name="emergencyContact1Name"
                    value={formData.emergencyContact1Name}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-md ${errors.emergencyContact1Name ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.emergencyContact1Name && <p className="text-red-500 text-xs mt-1">{errors.emergencyContact1Name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Full Address</label>
                  <textarea
                    name="emergencyContact1Address"
                    value={formData.emergencyContact1Address}
                    onChange={handleInputChange}
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone *</label>
                    <input
                      type="tel"
                      name="emergencyContact1Phone"
                      value={formData.emergencyContact1Phone}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-md ${errors.emergencyContact1Phone ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.emergencyContact1Phone && <p className="text-red-500 text-xs mt-1">{errors.emergencyContact1Phone}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Alternate Phone</label>
                    <input
                      type="tel"
                      name="emergencyContact1AltPhone"
                      value={formData.emergencyContact1AltPhone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Relationship *</label>
                  <input
                    type="text"
                    name="emergencyContact1Relationship"
                    value={formData.emergencyContact1Relationship}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-md ${errors.emergencyContact1Relationship ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.emergencyContact1Relationship && <p className="text-red-500 text-xs mt-1">{errors.emergencyContact1Relationship}</p>}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Emergency Contact 2 (Optional)</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    name="emergencyContact2Name"
                    value={formData.emergencyContact2Name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Full Address</label>
                  <textarea
                    name="emergencyContact2Address"
                    value={formData.emergencyContact2Address}
                    onChange={handleInputChange}
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input
                      type="tel"
                      name="emergencyContact2Phone"
                      value={formData.emergencyContact2Phone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Alternate Phone</label>
                    <input
                      type="tel"
                      name="emergencyContact2AltPhone"
                      value={formData.emergencyContact2AltPhone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Relationship</label>
                  <input
                    type="text"
                    name="emergencyContact2Relationship"
                    value={formData.emergencyContact2Relationship}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 4: // Agreements & Consent
        return (
          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="text-yellow-600 mt-1 mr-2 flex-shrink-0" size={20} />
                <p className="text-sm text-gray-700">
                  Please read each agreement carefully. By checking the boxes below, you acknowledge that you have read, understood, and agree to comply with all terms and conditions.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Admission Agreement</h3>
                <div className="text-sm text-gray-600 mb-3 max-h-40 overflow-y-auto">
                  <p className="mb-2">As a condition of acceptance into the Discipleship School of Ministry (DSM), I must abide by all rules and regulations of the school. I understand that it is my responsibility to know and understand the rules and regulations, and that violation may result in termination from the school.</p>
                  <p className="mb-2">The DSM is not responsible for administering medical treatment. The DSM will provide room and board. Personal items are kept at my own risk.</p>
                  <p>I understand the DSM does not house sex offenders and consent to a background check. I come voluntarily for spiritual growth in Christ.</p>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="admissionAgreementAccepted"
                    checked={formData.admissionAgreementAccepted}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">I accept the Admission Agreement *</span>
                </label>
                {errors.admissionAgreementAccepted && <p className="text-red-500 text-xs mt-1">{errors.admissionAgreementAccepted}</p>}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Liability Release and Waiver</h3>
                <div className="text-sm text-gray-600 mb-3 max-h-40 overflow-y-auto">
                  <p className="mb-2">I am at least 18 years of age and understand the dangers, risks and hazards of participating in the program. I agree to assume all risks and responsibilities.</p>
                  <p className="mb-2">I covenant not to sue and hereby release San Antonio Christian Church and the DSM from any liability arising from my participation in the program.</p>
                  <p>This is a legal agreement and includes a release of legal rights. I have given up considerable future legal rights by signing this waiver.</p>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="liabilityWaiverAccepted"
                    checked={formData.liabilityWaiverAccepted}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">I accept the Liability Waiver *</span>
                </label>
                {errors.liabilityWaiverAccepted && <p className="text-red-500 text-xs mt-1">{errors.liabilityWaiverAccepted}</p>}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Code of Conduct</h3>
                <div className="text-sm text-gray-600 mb-3 max-h-40 overflow-y-auto">
                  <p className="mb-2">Students are expected to conduct themselves in an ethical and moral manner becoming of a Christian. Violations include but are not limited to:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Alcohol intoxication or drug use</li>
                    <li>Sexual misconduct or harassment</li>
                    <li>Violence, fighting, or threats</li>
                    <li>Theft or false statements</li>
                    <li>Disrespect toward leadership</li>
                    <li>Refusal to participate in scheduled activities</li>
                  </ul>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="codeOfConductAccepted"
                    checked={formData.codeOfConductAccepted}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">I accept the Code of Conduct *</span>
                </label>
                {errors.codeOfConductAccepted && <p className="text-red-500 text-xs mt-1">{errors.codeOfConductAccepted}</p>}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Home Rules</h3>
                <div className="text-sm text-gray-600 mb-3 max-h-40 overflow-y-auto">
                  <p className="mb-2">Key rules include:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Must maintain desire to change and willingness to surrender</li>
                    <li>No alcohol or drugs - immediate expulsion</li>
                    <li>Required attendance at all church services and Bible studies</li>
                    <li>Must follow daily schedule and complete assigned chores</li>
                    <li>Respectful conduct at all times</li>
                    <li>Phone calls and visits on assigned dates only</li>
                  </ul>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="homeRulesAccepted"
                    checked={formData.homeRulesAccepted}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">I accept the Home Rules *</span>
                </label>
                {errors.homeRulesAccepted && <p className="text-red-500 text-xs mt-1">{errors.homeRulesAccepted}</p>}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Statement of Legal Status</h3>
                <div className="text-sm text-gray-600 mb-3 max-h-40 overflow-y-auto">
                  <p className="mb-2">I understand that as a student of the DSM:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>I am not a lessee and have no rights of residential tenancy</li>
                    <li>I have no property rights to the facilities or contents</li>
                    <li>I am a guest and must leave immediately upon request</li>
                    <li>Failure to leave constitutes criminal trespass</li>
                    <li>I may not receive mail at this address</li>
                  </ul>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="legalStatusAccepted"
                    checked={formData.legalStatusAccepted}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">I accept the Legal Status Statement *</span>
                </label>
                {errors.legalStatusAccepted && <p className="text-red-500 text-xs mt-1">{errors.legalStatusAccepted}</p>}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Electronic Signature</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Signature Date</label>
                  <input
                    type="date"
                    name="signatureDate"
                    value={formData.signatureDate}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Witness/Director Name</label>
                  <input
                    type="text"
                    name="witnessName"
                    value={formData.witnessName}
                    onChange={handleInputChange}
                    placeholder="Staff member name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button type="button" onClick={openSignatureModal} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Adopt a Signature</button>
                {errors.applicantSignatureDataUrl && <p className="text-red-500 text-xs mt-1">{errors.applicantSignatureDataUrl}</p>}
              </div>

              {formData.applicantSignatureDataUrl && (
                <div className="dsm-sig-preview mt-4">
                  <div className="dsm-sig-row">
                    <div className="dsm-sig-col">
                      <div className="cap">Signature</div>
                      <div className="sig-box"><img alt="signature" src={formData.applicantSignatureDataUrl} /></div>
                      <div className="sig-name">{formData.applicantFullName}</div>
                    </div>
                    <div className="dsm-sig-col">
                      <div className="cap">Initials</div>
                      <div className="sig-box sig-ini"><img alt="initials" src={formData.applicantInitialsDataUrl} /></div>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-2">
                By submitting this form, you certify that all information provided is true and accurate to the best of your knowledge.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Scoped styles for DSM Admission page */}
      <style>{`
        /* Root scope */
  .dsm { 
          --c-bg: #f9fafb; 
          --c-card: #ffffff;
          --c-border: #e5e7eb; 
          --c-muted: #6b7280; 
          --c-text: #111827; 
          --c-heading: #1f2937; 
          --c-primary: #2563eb; 
          --c-primary-hover: #1d4ed8; 
          --c-success: #16a34a; 
          --c-success-strong: #15803d;
          --c-warn-bg: #fffbeb; 
          --c-warn-border: #fcd34d; 
          --c-gray-50: #f9fafb; 
          --c-gray-200: #e5e7eb; 
          --c-gray-600: #4b5563; 
          --c-gray-700: #374151; 
          --c-gray-800: #1f2937; 
          --c-blue-600: #2563eb; 
          --c-green-500: #22c55e; 
          --c-red-500: #ef4444; 
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          color: var(--c-text);
          background: var(--c-bg);
        }

        .dsm *, .dsm *::before, .dsm *::after { box-sizing: border-box; }

        /* Utility subset used in this file (scoped) */
        .dsm .max-w-6xl { max-width: 72rem; }
        .dsm .mx-auto { margin-left: auto; margin-right: auto; }
        .dsm .w-full { width: 100%; }
        .dsm .w-10 { width: 2.5rem; }
        .dsm .h-10 { height: 2.5rem; }
        .dsm .h-0\.5 { height: 2px; }
        .dsm .top-5 { top: 1.25rem; }
        .dsm .left-1\/2 { left: 50%; }
        .dsm .p-6 { padding: 1.5rem; }
        .dsm .p-4 { padding: 1rem; }
        .dsm .px-3 { padding-left: .75rem; padding-right: .75rem; }
        .dsm .px-4 { padding-left: 1rem; padding-right: 1rem; }
        .dsm .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
        .dsm .py-2 { padding-top: .5rem; padding-bottom: .5rem; }
        .dsm .mb-1 { margin-bottom: .25rem; }
        .dsm .mb-2 { margin-bottom: .5rem; }
        .dsm .mb-4 { margin-bottom: 1rem; }
        .dsm .mt-1 { margin-top: .25rem; }
        .dsm .mt-2 { margin-top: .5rem; }
        .dsm .mt-4 { margin-top: 1rem; }
        .dsm .mr-1 { margin-right: .25rem; }
        .dsm .mr-2 { margin-right: .5rem; }
        .dsm .ml-1 { margin-left: .25rem; }
        .dsm .ml-2 { margin-left: .5rem; }

        .dsm .text-center { text-align: center; }
        .dsm .text-2xl { font-size: 1.5rem; line-height: 2rem; }
        .dsm .text-xs { font-size: .75rem; }
        .dsm .text-sm { font-size: .875rem; }
        .dsm .font-bold { font-weight: 700; }
        .dsm .font-semibold { font-weight: 600; }
        .dsm .font-medium { font-weight: 500; }

  .dsm .text-white { color: #ffffff; }
  .dsm .text-gray-800 { color: var(--c-gray-800); }
  .dsm .text-gray-700 { color: var(--c-gray-700); }
  .dsm .text-gray-600 { color: var(--c-gray-600); }
  .dsm .text-gray-500 { color: var(--c-muted); }
  .dsm .text-gray-400 { color: #9ca3af; }
  .dsm .text-blue-600 { color: var(--c-blue-600); }
  .dsm .text-yellow-600 { color: #ca8a04; }
  .dsm .text-red-500 { color: var(--c-red-500); }

        .dsm .bg-white { background-color: var(--c-card); }
        .dsm .bg-gray-50 { background-color: var(--c-gray-50); }
        .dsm .bg-gray-200 { background-color: var(--c-gray-200); }
  .dsm .bg-blue-600 { background-color: var(--c-blue-600); }
        .dsm .bg-green-500 { background-color: var(--c-green-500); }
  .dsm .bg-green-600 { background-color: #16a34a; }
        .dsm .bg-yellow-50 { background-color: var(--c-warn-bg); }
        .dsm .bg-gray-600 { background-color: #4b5563; }

        .dsm .hover\:bg-blue-700:hover { background-color: var(--c-primary-hover); }
        .dsm .hover\:bg-green-700:hover { background-color: var(--c-success-strong); }
        .dsm .hover\:bg-gray-700:hover { background-color: #374151; }

        .dsm .rounded-md { border-radius: .375rem; }
        .dsm .rounded-lg { border-radius: .5rem; }
        .dsm .rounded-full { border-radius: 9999px; }

        .dsm .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -2px rgba(0,0,0,.05); }

        .dsm .border { border: 1px solid var(--c-border); }
  .dsm .border-b { border-bottom: 1px solid var(--c-border); }
  .dsm .border-t { border-top: 1px solid var(--c-border); }
        .dsm .border-gray-300 { border-color: #d1d5db; }
        .dsm .border-yellow-200 { border-color: var(--c-warn-border); }
        .dsm .border-red-500 { border-color: var(--c-red-500) !important; }

        .dsm .flex { display: flex; }
        .dsm .flex-col { flex-direction: column; }
        .dsm .items-center { align-items: center; }
        .dsm .items-start { align-items: flex-start; }
  .dsm .justify-between { justify-content: space-between; }
  .dsm .justify-center { justify-content: center; }
  .dsm .flex-1 { flex: 1 1 0%; }
  .dsm .flex-shrink-0 { flex-shrink: 0; }

        .dsm .grid { display: grid; }
        .dsm .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
        .dsm .gap-4 { gap: 1rem; }
        @media (min-width: 768px) {
          .dsm .md\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dsm .md\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }

        .dsm .relative { position: relative; }
        .dsm .absolute { position: absolute; }
        .dsm .cursor-not-allowed { cursor: not-allowed; }

        .dsm .list-disc { list-style-type: disc; }
        .dsm .list-inside { list-style-position: inside; }

        .dsm .overflow-y-auto { overflow-y: auto; }
        .dsm .max-h-40 { max-height: 10rem; }

        /* Vertical rhythm helpers */
        .dsm .space-y-6 > * + * { margin-top: 1.5rem; }
        .dsm .space-y-4 > * + * { margin-top: 1rem; }
        .dsm .space-y-2 > * + * { margin-top: .5rem; }

        /* Form elements base */
        .dsm input[type="text"],
        .dsm input[type="date"],
        .dsm input[type="number"],
        .dsm input[type="tel"],
        .dsm select,
        .dsm textarea {
          width: 100%;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: .375rem;
          padding: .5rem .75rem;
          color: var(--c-text);
          outline: none;
          transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
        }
        .dsm input:focus,
        .dsm select:focus,
        .dsm textarea:focus {
          border-color: var(--c-primary);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }

        /* Buttons */
        .dsm button {
          border: none;
          border-radius: .375rem;
          transition: background-color .15s ease, transform .05s ease; 
          will-change: background-color, transform;
        }
        .dsm button:active { transform: translateY(1px); }

        /* Cards */
        .dsm .card { background: var(--c-card); border: 1px solid var(--c-border); border-radius: .5rem; }

        /* Progress steps */
        .dsm .dsm-steps { position: relative; }
        .dsm .dsm-step { position: relative; min-width: 0; }

  /* Signature modal and preview */
  .dsm .modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; z-index: 1000; }
  .dsm .modal-card { width: min(900px,95vw); background: #ffffff; border: 1px solid var(--c-border); border-radius: 12px; box-shadow: var(--c-shadow, 0 10px 30px rgba(0,0,0,.2)); overflow: hidden; }
  .dsm .modal-head { display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; border-bottom: 1px solid var(--c-border); }
  .dsm .modal-body { padding: 16px; }
  .dsm .tabs { display:flex; gap:8px; flex-wrap: wrap; margin-bottom: 12px; }
  .dsm .tab { background:#f3f4f6; border:1px solid #e5e7eb; color:#111827; padding:8px 12px; border-radius: 8px; cursor:pointer; font-size: 13px; }
  .dsm .tab.active { background:#e0e7ff; border-color:#c7d2fe; color:#1e3a8a; }
  .dsm .sig-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .dsm .sig-card { background:#f9fafb; border:1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
  .dsm .sig-preview { background:#ffffff; border:1px dashed #d1d5db; border-radius: 10px; padding: 12px; display:flex; align-items:center; justify-content:center; min-height: 100px; }
  .dsm .sig-preview .sig-text { font-size: 36px; line-height: 1.2; }
  .dsm .sig-controls { display:flex; gap:8px; align-items:center; flex-wrap: wrap; margin-top: 10px; }
  .dsm .sig-canvas-wrap { border:1px solid #d1d5db; border-radius: 10px; background:#fff; overflow:hidden; }
  .dsm .sig-canvas { display:block; width: 700px; height: 200px; touch-action: none; }
  .dsm .actions { display:flex; justify-content:flex-end; gap: 10px; padding: 12px 16px; border-top:1px solid #e5e7eb; }
  .dsm .btn { background:#4b5563; color:#fff; border:none; padding:8px 12px; border-radius: 8px; cursor:pointer; }
  .dsm .btn.primary { background:#2563eb; }
  .dsm .btn.ghost { background:#6b7280; }
  .dsm .btn:hover { filter: brightness(0.95); }
  .dsm .dsm-sig-preview { background:#f9fafb; border:1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
  .dsm .dsm-sig-row { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .dsm .dsm-sig-col { background:#ffffff; border:1px solid #e5e7eb; border-radius: 10px; padding: 12px; display:flex; flex-direction: column; gap: 8px; }
  .dsm .sig-box { display:grid; place-items:center; background:#fff; border:1px dashed #d1d5db; border-radius: 10px; min-height: 100px; overflow: hidden; }
  .dsm .sig-box img { max-width: 100%; height: auto; display: block; }
  .dsm .sig-box.sig-ini { min-height: 80px; }
  .dsm .sig-name { font-size: 12px; color:#6b7280; text-align:center; }
      `}</style>

      <div className="dsm">
        <div className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-lg">
            <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-gray-800">DSM Admission Application</h1>
          <p className="text-gray-600 mt-2">Complete all sections to submit your application</p>
            </div>

        {/* Progress Steps */}
        <div className="p-6 border-b bg-gray-50">
          <div className="flex justify-between dsm-steps">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div 
                  key={index}
                  className={`dsm-step flex flex-col items-center flex-1 ${index <= currentStep ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    index < currentStep ? 'bg-green-500 text-white' :
                    index === currentStep ? 'bg-blue-600 text-white' :
                    'bg-gray-200'
                  }`}>
                    {index < currentStep ? <Check size={20} /> : <Icon size={20} />}
                  </div>
                  <span className="text-xs text-center">{step.title}</span>
                  {index < steps.length - 1 && (
                    <div className={`absolute w-full h-0.5 top-5 left-1/2 ${
                      index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                    }`} style={{ width: 'calc(100% - 40px)', transform: 'translateX(20px)' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className={`flex items-center px-4 py-2 rounded-md ${
                currentStep === 0 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <ChevronLeft size={20} className="mr-1" />
              Previous
            </button>

            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Next
                <ChevronRight size={20} className="ml-1" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex items-center px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Check size={20} className="mr-1" />
                Submit Application
              </button>
            )}
          </div>
        </div>
          </div>
        </div>
        {showSignatureModal && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-head">
                <h2 className="text-gray-800 font-semibold">Adopt a Signature</h2>
                <button className="btn ghost" onClick={closeSignatureModal}>Close</button>
              </div>
              <div className="modal-body">
                <div className="tabs">
                  <button className={`tab ${sigTab==='type' ? 'active' : ''}`} onClick={() => setSigTab('type')}>Type</button>
                  <button className={`tab ${sigTab==='draw' ? 'active' : ''}`} onClick={() => setSigTab('draw')}>Draw</button>
                </div>

              {sigTab === 'type' && (
                  <div className="sig-grid">
                    <div className="sig-card">
                      <label className="block text-sm font-medium mb-1">Your full name</label>
                      <input
                        type="text"
                        value={sigPreviewName}
                        onChange={(e) => setSigPreviewName(e.target.value)}
                        placeholder="Type your full legal name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <div className="sig-controls">
                        <label className="text-sm">Font</label>
                        <select
                          className="px-3 py-2 border border-gray-300 rounded-md"
                          value={sigFont}
                          onChange={(e) => setSigFont(e.target.value)}
                        >
                          {FONT_CHOICES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="sig-card">
                      <div className="sig-preview">
                  <div className="sig-text" style={{ fontFamily: `'${sigFont}', cursive`, color: '#000000' }}>
                          {sigPreviewName || 'Your Name'}
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-2">Preview</div>
                    </div>
                  </div>
                )}

              {sigTab === 'draw' && (
                  <div className="sig-card">
                    <div className="sig-controls">
                      <label className="text-sm">Size</label>
                      <input type="range" min="1" max="8" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} />
                      <button type="button" className="btn" onClick={clearDrawing}>Clear</button>
                    </div>
                    <div className="sig-canvas-wrap mt-2">
                      <canvas ref={drawCanvasRef} className="sig-canvas" />
                    </div>
                  </div>
                )}
              </div>
              <div className="actions">
                <button className="btn" onClick={closeSignatureModal}>Cancel</button>
                {sigTab === 'type' ? (
                  <button className="btn primary" onClick={adoptTypedSignature}>Adopt</button>
                ) : (
                  <button className="btn primary" onClick={adoptDrawnSignature}>Adopt</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default DSMAdmissionForm;