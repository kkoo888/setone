// Yumi Live2D HitArea Detection (Auto-generated)
// Includes: HitAreaHead, HitAreaBody + 14 sub-regions

function yumi_hitarea_test(_mx, _my) {
    if (_mx >= 0.000166 && _mx <= 0.645302 && _my >= 0.0 && _my <= 0.964999) { return "HitAreaHead"; }
    if (_mx >= 0.0 && _mx <= 1.0 && _my >= 0.0 && _my <= 1.0) { return "HitAreaBody"; }
    if (_mx >= 0.006106 && _mx <= 0.590214 && _my >= 0.290117 && _my <= 0.949845) { return "Head"; }
    if (_mx >= 0.030904 && _mx <= 0.588656 && _my >= 0.290117 && _my <= 0.949845) { return "Face"; }
    if (_mx >= 0.003513 && _mx <= 0.632329 && _my >= 0.290117 && _my <= 0.964999) { return "Eyes"; }
    if (_mx >= 0.000166 && _mx <= 0.549809 && _my >= 0.290117 && _my <= 0.880398) { return "Mouth"; }
    if (_mx >= 0.07264 && _mx <= 0.411462 && _my >= 0.290117 && _my <= 0.932488) { return "Nose"; }
    if (_mx >= 0.003407 && _mx <= 0.549654 && _my >= 0.290117 && _my <= 0.918456) { return "Ears"; }
    if (_mx >= 0.088276 && _mx <= 0.645302 && _my >= 0.290117 && _my <= 0.87846) { return "Neck"; }
    if (_mx >= 0.003024 && _mx <= 0.549654 && _my >= 0.0 && _my <= 0.942752) { return "HairFront"; }
    if (_mx >= 0.002913 && _mx <= 0.643765 && _my >= 0.290117 && _my <= 0.942752) { return "HairBack"; }
    if (_mx >= 0.086897 && _mx <= 0.642288 && _my >= 0.290117 && _my <= 0.962453) { return "Hat"; }
    if (_mx >= 0.000756 && _mx <= 0.645335 && _my >= 0.290117 && _my <= 0.963397) { return "Body"; }
    if (_mx >= 0.0 && _mx <= 1.0 && _my >= 0.0 && _my <= 1.0) { return "Hands"; }
    if (_mx >= 0.0 && _mx <= 0.645335 && _my >= 0.290117 && _my <= 0.963397) { return "Leg"; }
    if (_mx >= 0.030904 && _mx <= 0.588656 && _my >= 0.290117 && _my <= 0.949845) { return "Bag"; }
    if (_mx >= 0.085511 && _mx <= 0.64037 && _my >= 0.290117 && _my <= 0.967914) { return "Dog"; }
    if (_mx >= 0.088124 && _mx <= 0.645302 && _my >= 0.290117 && _my <= 0.909291) { return "Flowers"; }
    return "";
}