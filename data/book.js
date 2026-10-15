/* Mom's "Blue Book" — the family cookbook every new book starts from.
   Recipe text format (used by every file in data/):
     ing / steps: one line each.
       "# Dressing"   a group heading
       "- ..."        a sub-step under the step above it
     serves: the number the amounts are written for.
     est: true when that number is our best guess (shows "estimated").
     makes: a unit when the recipe "Makes" something ("dozen", "loaves") instead of "Serves". */
window.BB = { sections: [], recipes: [], menus: [] };

// Mom's pictures from the Blue Book (photos/<recipe id>.jpg). Anyone can swap in their own.
BB.photos = ['honey-carrots', 'au-gratin', 'spinach-salad', 'black-bean-salad', 'chinese-coleslaw', 'thanksgiving-stuffing', 'taco-salad',
  'bean-dip', 'broccoli-cherry-salad', 'judy-corn-casserole', 'sweet-potato-delight', 'cowboy-caviar', 'whitefish-parmesan', 'sloppy-joes',
  'lazy-lasagna', 'toll-house-cookies', 'rice-krispie-treats', 'diana-banana-bread', 'moms-mead', 'nicks-sangria', 'lime-jello-mold',
  'dads-turkey', 'cranberry-relish'];
BB.add = r => BB.recipes.push(Object.assign({ tags: [], est: true, layout: 'side' },
  BB.photos.includes(r.id) ? { photo: `photos/${r.id}.jpg` } : {}, r));

BB.sections = [
  { id: 'sides',    name: 'Sides & Salads',                              tab: 'Sides',    color: 'sage' },
  { id: 'soups',    name: 'Soup, Stew & Chili...oh my!',                 tab: 'Soups',    color: 'terracotta' },
  { id: 'entrees',  name: 'Entrees! Italian Dishes go first of course!!', tab: 'Entrées',  color: 'rose' },
  { id: 'desserts', name: 'Desserts & Breads – the Icing on the Cake!',  tab: 'Desserts', color: 'blue' },
  { id: 'drinks',   name: 'Drinks',                                       tab: 'Drinks',   color: 'mustard' },
  { id: 'holiday',  name: 'Holiday Meals',                                tab: 'Holiday',  color: 'deep' },
];

BB.letter = {
  title: 'Our Family’s “Blue Book” Recipes',
  photos: ['photos/letter-book.jpg', 'photos/letter-mom.jpg'],
  to: 'To my amazing kids (Gavin, Gabriella, Josephina, Isabella, Dahlia and now Emily Jean and Nick!),',
  body: [
    'Truly, it’s a joy spending time cooking or baking up food from the heart. I cherish the time I spent passing on what I learned in the kitchen alongside my own mother, @ Nona. Thanks for keeping the memories alive and well in your own kitchens! Experiment. Make mistakes. Learn from them and move on...that’s what will make a great cook!',
    'Season your food well...with my favorites: Basil, Italian Seasoning, Garlic Salt, Cardamom and Coriander plus Cinnamon, and Cilantro. Geez there are so many wonderful tastes and smells to spice your food up. Try them all and more! But mostly season it with love...Isabella swears that you can tell if it’s been added :)',
    'Don’t be afraid to try new recipes and add them here once approved by your own family. The more we can add to this the better! I love you all and cherish our memories spent eating, laughing, and enjoying one another. Family is a gift from God in Heaven. Remember to take the time to cook with your own little ones as soon as they’re old enough to sport an apron!',
  ],
  close: 'Hugs and love,',
  sign: 'Mom',
  signFull: '(aka...Jeannine Layne Baum Blake)',
  ps: 'P.S. If you make one of the recipes here and want to add an * with your family’s favorite tweaks...please do so! Also, if you make one please take a family pic with the dish as the pics here are just stock pics and not the actual recipes...I got as close as possible though!',
};

// Holiday & season tags everyone gets; people can add their own tags too.
BB.builtInTags = ['Thanksgiving', 'Christmas', 'Easter', 'Fourth of July', 'Summer', 'Fall', 'Winter', 'Spring'];

// The Holiday Meals section shows each of these as a menu, in this order.
BB.menus = [
  { tag: 'Thanksgiving', name: 'Our Family’s Thanksgiving Favorites',
    order: ['dads-turkey', 'thanksgiving-stuffing', 'mashed-potatoes', 'gravy', 'judy-corn-casserole', 'sweet-potato-delight',
            'stuffed-mushrooms', 'green-bean-casserole', 'micheles-corn-casserole', 'cranberry-relish', 'lime-jello-mold', 'apple-betty'],
    note: 'Don’t forget the Kings Hawaiian Rolls!', photos: ['photos/menu-kings-hawaiian.jpg', 'photos/menu-pumpkin-pie.jpg'] },
  { tag: 'Christmas', name: 'Christmas' },
];
