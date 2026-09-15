const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const cssToAdd = `
  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }
  .user-avatar-large {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
  }
`;

code = code.replace('</style>', cssToAdd + '</style>');
fs.writeFileSync('index.html', code);
