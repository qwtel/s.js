function equals(o1, o2) {
  if (o1.equals) {
    if (o2.equals) {
      return o1.equals(o2);
    } else {
      return false;
    }
  } else {
    if (o2.equals) {
      return o1 === o2;
    } else {
      return false;
    }
  }
}

exports.equals = equals;
